import { Router } from 'express';
import multer from 'multer';
import { getPresignedUploadUrl, getPresignedDownloadUrl } from '../s3';
import { prisma } from '../lib/prisma';
import { authenticateToken, validateConversationAccess, AuthenticatedRequest } from '../middleware/auth';

import crypto from 'crypto';

// Helper function to generate S3 key with content-based hashing
function generateS3Key(fileName: string, fileType: string, conversationId: string, fileBuffer?: Buffer): string {
  const fileExtension = fileName.split('.').pop() || '';
  
  // Determine if it's an image or video based on file type
  const isImage = fileType.startsWith('image/');
  const isVideo = fileType.startsWith('video/');
  
  // Create folder structure: chats/conversationId/images|videos/
  const folderType = isImage ? 'images' : isVideo ? 'videos' : 'files';
  
  // Generate content hash for deduplication
  let contentHash = '';
  if (fileBuffer) {
    contentHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  } else {
    // Fallback to timestamp if no buffer provided
    contentHash = Date.now().toString();
  }
  
  // Clean filename (remove special characters)
  const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  
  return `chats/${conversationId}/${folderType}/${contentHash}-${cleanFileName}`;
}

// Helper function to check if file already exists in conversation
async function checkFileExists(conversationId: string, contentHash: string): Promise<boolean> {
  const existingMedia = await prisma.media.findFirst({
    where: {
      conversationId: conversationId,
      s3Key: {
        contains: contentHash
      }
    }
  });
  return !!existingMedia;
}

const router = Router();

// Configure multer for memory storage
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for media files
  },
});

// Check for duplicate file before generating presigned URL
router.post('/check-duplicate/:conversationId', authenticateToken, validateConversationAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { conversationId } = req.params;
    const { contentHash, fileName, fileType } = req.body;
    
    console.log('Duplicate check request:', {
      conversationId,
      contentHash,
      fileName,
      fileType,
      user: req.user?.uid
    });
    
    if (!contentHash || !fileName || !fileType) {
      return res.status(400).json({ error: 'Content hash, file name and type are required' });
    }

    const currentUser = await prisma.user.findUnique({
      where: { firebaseUid: req.user!.uid },
      select: { id: true },
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'Current user not found' });
    }

    // Check if file already exists in this conversation
    const existingMedia = await prisma.media.findFirst({
      where: {
        conversationId: conversationId,
        s3Key: {
          contains: contentHash
        }
      }
    });

    if (existingMedia) {
      // File already exists, return existing file info
      return res.json({
        isDuplicate: true,
        existingMedia: {
          id: existingMedia.id,
          s3Key: existingMedia.s3Key,
          s3Url: existingMedia.s3Url,
          fileName: existingMedia.fileName,
          fileType: existingMedia.fileType,
          fileSize: existingMedia.fileSize
        }
      });
    }

    // File doesn't exist, proceed with presigned URL generation
    res.json({ isDuplicate: false });
  } catch (error) {
    console.error('Duplicate check error:', error);
    res.status(500).json({ error: 'Failed to check for duplicates' });
  }
});

// Get presigned URL for file upload (only after duplicate check)
router.post('/upload-url/:conversationId', authenticateToken, validateConversationAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { conversationId } = req.params;
    const { fileName, fileType, messageId, contentHash } = req.body;
    
    console.log('Upload URL request:', {
      conversationId,
      fileName,
      fileType,
      messageId,
      contentHash,
      user: req.user?.uid
    });
    
    if (!fileName || !fileType || !contentHash) {
      return res.status(400).json({ error: 'File name, type, and content hash are required' });
    }

    const currentUser = await prisma.user.findUnique({
      where: { firebaseUid: req.user!.uid },
      select: { id: true },
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'Current user not found' });
    }

    // Double-check for duplicates (safety measure)
    const existingMedia = await prisma.media.findFirst({
      where: {
        conversationId: conversationId,
        s3Key: {
          contains: contentHash
        }
      }
    });

    if (existingMedia) {
      return res.status(409).json({ 
        error: 'File already exists',
        existingMedia: {
          id: existingMedia.id,
          s3Key: existingMedia.s3Key,
          s3Url: existingMedia.s3Url
        }
      });
    }

    // Generate S3 key with content hash for deduplication
    const key = generateS3Key(fileName, fileType, conversationId, Buffer.from(contentHash, 'hex'));
    const uploadUrl = await getPresignedUploadUrl(key, fileType);
    const s3Url = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    
    // Create media record in database (will be updated after upload)
    const media = await prisma.media.create({
      data: {
        userId: currentUser.id,
        conversationId: conversationId,
        messageId: messageId || null,
        fileName,
        fileType,
        fileSize: 0, // Will be updated after upload
        s3Key: key,
        s3Url,
      },
    });
    
    res.json({ 
      uploadUrl, 
      key,
      mediaId: media.id,
      s3Url,
      expiresIn: 300 // 5 minutes
    });
  } catch (error) {
    console.error('Upload URL error:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

// Create media record for duplicate file (reuse existing S3 file)
router.post('/create-duplicate-media/:conversationId', authenticateToken, validateConversationAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { conversationId } = req.params;
    const { existingMediaId, messageId, fileName, fileType } = req.body;
    
    if (!existingMediaId || !fileName || !fileType) {
      return res.status(400).json({ error: 'Existing media ID, file name and type are required' });
    }

    const currentUser = await prisma.user.findUnique({
      where: { firebaseUid: req.user!.uid },
      select: { id: true },
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'Current user not found' });
    }

    // Get the existing media to reuse its S3 file
    const existingMedia = await prisma.media.findFirst({
      where: {
        id: existingMediaId,
        conversationId: conversationId
      }
    });

    if (!existingMedia) {
      return res.status(404).json({ error: 'Existing media not found' });
    }

    // Create new media record pointing to existing S3 file
    const media = await prisma.media.create({
      data: {
        userId: currentUser.id,
        conversationId: conversationId,
        messageId: messageId || null,
        fileName,
        fileType,
        fileSize: existingMedia.fileSize,
        s3Key: existingMedia.s3Key, // Same S3 key
        s3Url: existingMedia.s3Url, // Same S3 URL
        width: existingMedia.width,
        height: existingMedia.height,
        duration: existingMedia.duration,
        thumbnailUrl: existingMedia.thumbnailUrl,
      },
    });

    res.json({
      id: media.id,
      key: media.s3Key,
      url: media.s3Url,
      fileName: media.fileName,
      fileType: media.fileType,
      size: media.fileSize,
      isDuplicate: true
    });
  } catch (error) {
    console.error('Create duplicate media error:', error);
    res.status(500).json({ error: 'Failed to create duplicate media record' });
  }
});

// Confirm file upload and update media record
router.post('/confirm-upload', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { mediaId, fileSize, width, height, duration, thumbnailUrl } = req.body;
    
    if (!mediaId) {
      return res.status(400).json({ error: 'Media ID is required' });
    }

    const currentUser = await prisma.user.findUnique({
      where: { firebaseUid: req.user!.uid },
      select: { id: true },
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'Current user not found' });
    }

    const media = await prisma.media.update({
      where: {
        id: mediaId,
        userId: currentUser.id,
      },
      data: {
        fileSize: fileSize || 0,
        width: width || null,
        height: height || null,
        duration: duration || null,
        thumbnailUrl: thumbnailUrl || null,
      },
    });

    res.json(media);
  } catch (error) {
    console.error('Confirm upload error:', error);
    res.status(500).json({ error: 'Failed to confirm upload' });
  }
});

// Get presigned URL for file download (5 minutes expiry for security)
router.get('/download-url/:key', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { key } = req.params;
    const downloadUrl = await getPresignedDownloadUrl(key);
    
    res.json({ 
      downloadUrl,
      expiresIn: 300 // 5 minutes
    });
  } catch (error) {
    console.error('Download URL error:', error);
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});

// Get presigned URL for media viewing (1 day expiry)
router.get('/view-url/:mediaId', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { mediaId } = req.params;

    const currentUser = await prisma.user.findUnique({
      where: { firebaseUid: req.user!.uid },
      select: { id: true },
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Find the media and verify user has access to it
    const media = await prisma.media.findFirst({
      where: {
        id: mediaId,
        OR: [
          { userId: currentUser.id }, // User owns the media
          {
            conversation: {
              OR: [
                { user1Id: currentUser.id },
                { user2Id: currentUser.id },
              ],
            },
          },
        ],
      },
    });

    if (!media) {
      return res.status(404).json({ error: 'Media not found or access denied' });
    }

    const viewUrl = await getPresignedDownloadUrl(media.s3Key, 60 * 60 * 24); // 1 day
    
    res.json({ 
      viewUrl,
      expiresIn: 60 * 60 * 24 // 1 day
    });
  } catch (error) {
    console.error('View URL error:', error);
    res.status(500).json({ error: 'Failed to generate view URL' });
  }
});

// Get media by ID
router.get('/:mediaId', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { mediaId } = req.params;

    const currentUser = await prisma.user.findUnique({
      where: { firebaseUid: req.user!.uid },
      select: { id: true },
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'Current user not found' });
    }

    const media = await prisma.media.findFirst({
      where: {
        id: mediaId,
        OR: [
          { userId: currentUser.id },
          {
            conversation: {
              OR: [
                { user1Id: currentUser.id },
                { user2Id: currentUser.id },
              ],
            },
          },
        ],
      },
    });

    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    res.json(media);
  } catch (error) {
    console.error('Get media error:', error);
    res.status(500).json({ error: 'Failed to get media' });
  }
});

// Delete media
router.delete('/:mediaId', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { mediaId } = req.params;

    const currentUser = await prisma.user.findUnique({
      where: { firebaseUid: req.user!.uid },
      select: { id: true },
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'Current user not found' });
    }

    const media = await prisma.media.findFirst({
      where: {
        id: mediaId,
        userId: currentUser.id,
      },
    });

    if (!media) {
      return res.status(404).json({ error: 'Media not found or not authorized' });
    }

    await prisma.media.delete({
      where: { id: mediaId },
    });

    res.json({ message: 'Media deleted successfully' });
  } catch (error) {
    console.error('Delete media error:', error);
    res.status(500).json({ error: 'Failed to delete media' });
  }
});

// Handle direct file upload (alternative to presigned URLs)
router.post('/upload/:conversationId', upload.single('file'), authenticateToken, validateConversationAccess, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { conversationId } = req.params;
    const { originalname, mimetype, buffer } = req.file;
    const { messageId } = req.body;
    
    const currentUser = await prisma.user.findUnique({
      where: { firebaseUid: req.user!.uid },
      select: { id: true },
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'Current user not found' });
    }

    // Generate content hash for deduplication
    const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
    
    // Check if file already exists in this conversation
    const fileExists = await checkFileExists(conversationId, contentHash);
    
    if (fileExists) {
      // File already exists, create new media record with same S3 URL
      const existingMedia = await prisma.media.findFirst({
        where: {
          conversationId: conversationId,
          s3Key: {
            contains: contentHash
          }
        }
      });
      
      // Create new media record pointing to existing S3 file
      const media = await prisma.media.create({
        data: {
          userId: currentUser.id,
          conversationId: conversationId,
          messageId: messageId || null,
          fileName: originalname,
          fileType: mimetype,
          fileSize: buffer.length,
          s3Key: existingMedia!.s3Key, // Same S3 key
          s3Url: existingMedia!.s3Url, // Same S3 URL
        },
      });
      
      return res.json({
        id: media.id,
        key: media.s3Key,
        url: media.s3Url,
        fileName: originalname,
        fileType: mimetype,
        size: buffer.length
      });
    }
    
    // Generate organized S3 key with content hash
    const key = generateS3Key(originalname, mimetype, conversationId, buffer);
    const uploadUrl = await getPresignedUploadUrl(key, mimetype);
    const s3Url = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    
    // Create media record in database
    const media = await prisma.media.create({
      data: {
        userId: currentUser.id,
        conversationId: conversationId,
        messageId: messageId || null,
        fileName: originalname,
        fileType: mimetype,
        fileSize: buffer.length,
        s3Key: key,
        s3Url,
      },
    });
    
    res.json({
      id: media.id,
      key,
      url: s3Url,
      fileName: originalname,
      fileType: mimetype,
      size: buffer.length
    });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});


// Security logout endpoint
router.post('/security-logout', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { reason } = req.body;
    
    console.log(`🚨 Security Logout: User ${req.user!.uid} logged out due to: ${reason}`);
    
    // Here you could add additional security measures like:
    // - Blacklist the token
    // - Log the security incident
    // - Notify administrators
    // - Invalidate all user sessions
    
    res.json({ 
      message: 'Session terminated for security reasons',
      reason: reason || 'security_violation',
      logout: true
    });
  } catch (error) {
    console.error('Security logout error:', error);
    res.status(500).json({ error: 'Failed to process security logout' });
  }
});

// Cancel upload and clean up database
router.post('/cancel-upload', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { mediaId } = req.body;
    
    if (!mediaId) {
      return res.status(400).json({ error: 'Media ID is required' });
    }

    // Find the media record
    const media = await prisma.media.findUnique({
      where: { id: mediaId },
      include: { conversation: true }
    });

    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    // Check if user has access to this conversation
    if (!media.conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    const hasAccess = media.conversation.user1Id === req.user?.uid || 
                     media.conversation.user2Id === req.user?.uid;
    
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if this media is still being uploaded (not confirmed yet)
    // If it has a messageId, it means it's already been attached to a message
    if (media.messageId) {
      return res.status(400).json({ error: 'Media already uploaded, cannot cancel' });
    }

    // Delete the media record from database
    await prisma.media.delete({
      where: { id: mediaId }
    });

    // Note: We don't delete from S3 here because the file might not exist yet
    // or might be cleaned up by S3 lifecycle policies for incomplete uploads

    res.json({ message: 'Upload cancelled and cleaned up successfully' });
  } catch (error) {
    console.error('Cancel upload error:', error);
    res.status(500).json({ error: 'Failed to cancel upload' });
  }
});

export default router;

