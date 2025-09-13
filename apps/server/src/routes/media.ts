import { Router } from 'express';
import multer from 'multer';
import { getPresignedUploadUrl, getPresignedDownloadUrl } from '../s3';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Configure multer for memory storage
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for media files
  },
});

// Get presigned URL for file upload
router.post('/upload-url', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { fileName, fileType, conversationId, messageId } = req.body;
    
    if (!fileName || !fileType) {
      return res.status(400).json({ error: 'File name and type are required' });
    }

    const currentUser = await prisma.user.findUnique({
      where: { firebaseUid: req.user!.uid },
      select: { id: true },
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'Current user not found' });
    }

    const key = `media/${Date.now()}-${fileName}`;
    const uploadUrl = await getPresignedUploadUrl(key, fileType);
    const s3Url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    
    // Create media record in database
    const media = await prisma.media.create({
      data: {
        userId: currentUser.id,
        conversationId: conversationId || null,
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
      expiresIn: 3600 // 1 hour
    });
  } catch (error) {
    console.error('Upload URL error:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
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

// Get presigned URL for file download
router.get('/download-url/:key', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { key } = req.params;
    const downloadUrl = await getPresignedDownloadUrl(key);
    
    res.json({ downloadUrl });
  } catch (error) {
    console.error('Download URL error:', error);
    res.status(500).json({ error: 'Failed to generate download URL' });
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
router.post('/upload', upload.single('file'), authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { originalname, mimetype, buffer } = req.file;
    const { conversationId, messageId } = req.body;
    
    const currentUser = await prisma.user.findUnique({
      where: { firebaseUid: req.user!.uid },
      select: { id: true },
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'Current user not found' });
    }

    const key = `media/${Date.now()}-${originalname}`;
    const uploadUrl = await getPresignedUploadUrl(key, mimetype);
    const s3Url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    
    // Create media record in database
    const media = await prisma.media.create({
      data: {
        userId: currentUser.id,
        conversationId: conversationId || null,
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

export default router;

