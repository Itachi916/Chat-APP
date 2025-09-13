import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { getSocketServer } from '../socket';

const router = Router();

// Get messages for a conversation
router.get('/conversation/:conversationId', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { conversationId } = req.params;
    const { page = '1', limit = '50' } = req.query;

    const currentUser = await prisma.user.findUnique({
      where: { firebaseUid: req.user!.uid },
      select: { id: true },
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user is part of the conversation
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        OR: [
          { user1Id: currentUser.id },
          { user2Id: currentUser.id },
        ],
      },
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Determine which user the current user is in the conversation
    const isUser1 = conversation.user1Id === currentUser.id;
    
    const messages = await prisma.message.findMany({
      where: { 
        conversationId,
        // Filter out messages deleted by the current user
        ...(isUser1 ? { deletedByUser1: false } : { deletedByUser2: false })
      },
      include: {
        sender: {
          select: {
            id: true,
            firebaseUid: true,
            username: true,
            displayName: true,
            avatar: true,
          },
        },
        media: {
          select: {
            id: true,
            fileName: true,
            fileType: true,
            s3Key: true,
          },
        },
        replyTo: {
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                displayName: true,
              },
            },
          },
        },
        receipts: {
          where: { userId: currentUser.id },
          select: {
            status: true,
            timestamp: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum,
    });

    // Get total count for pagination
    const totalMessages = await prisma.message.count({
      where: { conversationId },
    });

    // Format messages for response
    const formattedMessages = messages.map((message) => ({
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      content: message.content,
      messageType: message.messageType,
      replyToId: message.replyToId,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      sender: message.sender,
      media: message.media,
      replyTo: message.replyTo,
      receipt: message.receipts[0] || null,
    }));

    res.json({
      messages: formattedMessages.reverse(), // Reverse to show oldest first
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalMessages,
        pages: Math.ceil(totalMessages / limitNum),
      },
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// Send a message
router.post('/', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { conversationId, content, messageType = 'TEXT', mediaIds, replyToId } = req.body;

    if (!conversationId) {
      return res.status(400).json({ error: 'Conversation ID is required' });
    }
    
    // For media messages, content is optional if mediaIds are provided
    if (!content && (!mediaIds || mediaIds.length === 0)) {
      return res.status(400).json({ error: 'Either content or mediaIds are required' });
    }

    const currentUser = await prisma.user.findUnique({
      where: { firebaseUid: req.user!.uid },
      select: { id: true },
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user is part of the conversation
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        OR: [
          { user1Id: currentUser.id },
          { user2Id: currentUser.id },
        ],
      },
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Get the other user in the conversation
    const otherUserId = conversation.user1Id === currentUser.id 
      ? conversation.user2Id 
      : conversation.user1Id;

    // Create the message
    const message = await prisma.message.create({
      data: {
        conversationId,
        senderId: currentUser.id,
        content: content || '', // Allow empty content for media messages
        messageType: messageType as any,
        replyToId,
      },
      include: {
        sender: {
          select: {
            id: true,
            firebaseUid: true,
            username: true,
            displayName: true,
            avatar: true,
          },
        },
        media: {
          select: {
            id: true,
            fileName: true,
            fileType: true,
            s3Key: true,
          },
        },
        replyTo: {
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                displayName: true,
              },
            },
          },
        },
      },
    });

    // Link media to the message if mediaIds are provided
    if (mediaIds && mediaIds.length > 0) {
      console.log('Linking media to message:', {
        messageId: message.id,
        mediaIds: mediaIds,
        userId: currentUser.id
      });
      
      const updateResult = await prisma.media.updateMany({
        where: {
          id: { in: mediaIds },
          userId: currentUser.id, // Ensure user owns the media
        },
        data: {
          messageId: message.id,
        },
      });
      
      console.log('Media update result:', updateResult);
      
      // Fetch the message again with media included
      const messageWithMedia = await prisma.message.findUnique({
        where: { id: message.id },
        include: {
          sender: {
            select: {
              id: true,
              firebaseUid: true,
              username: true,
              displayName: true,
              avatar: true,
            },
          },
          media: {
            select: {
              id: true,
              fileName: true,
              fileType: true,
              s3Key: true, // Include s3Key instead of s3Url
            },
          },
          replyTo: {
            include: {
              sender: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                },
              },
            },
          },
        },
      });
      
      if (messageWithMedia) {
        message.media = messageWithMedia.media;
      }
    }

    // Update conversation's last message time
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });

    // Create message receipts for both users
    await Promise.all([
      prisma.messageReceipt.create({
        data: {
          messageId: message.id,
          userId: currentUser.id,
          status: 'SENT',
        },
      }),
      prisma.messageReceipt.create({
        data: {
          messageId: message.id,
          userId: otherUserId,
          status: 'SENT',
        },
      }),
    ]);

    // Emit message via socket for real-time updates
    try {
      const io = getSocketServer();
      console.log('Message being emitted:', JSON.stringify(message, null, 2));
      io.to(`conversation:${conversationId}`).emit('new-message', message);
      
      // Emit conversation update
      io.to(`conversation:${conversationId}`).emit('conversation-updated', {
        conversationId,
        lastMessage: message,
        lastMessageAt: new Date(),
      });
    } catch (socketError) {
      console.error('Socket emission error:', socketError);
      // Don't fail the request if socket emission fails
    }

    res.status(201).json(message);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Update message receipt status
router.put('/:messageId/receipt', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { messageId } = req.params;
    const { status } = req.body;

    if (!['SENT', 'DELIVERED', 'READ'].includes(status)) {
      return res.status(400).json({ error: 'Invalid receipt status' });
    }

    const currentUser = await prisma.user.findUnique({
      where: { firebaseUid: req.user!.uid },
      select: { id: true },
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user has access to this message
    const message = await prisma.message.findFirst({
      where: {
        id: messageId,
        conversation: {
          OR: [
            { user1Id: currentUser.id },
            { user2Id: currentUser.id },
          ],
        },
      },
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const receipt = await prisma.messageReceipt.upsert({
      where: {
        messageId_userId: {
          messageId,
          userId: currentUser.id,
        },
      },
      update: {
        status: status as any,
        timestamp: new Date(),
      },
      create: {
        messageId,
        userId: currentUser.id,
        status: status as any,
      },
    });

    res.json(receipt);
  } catch (error) {
    console.error('Update receipt error:', error);
    res.status(500).json({ error: 'Failed to update receipt' });
  }
});

// Soft delete a message
router.delete('/:messageId', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { messageId } = req.params;

    const currentUser = await prisma.user.findUnique({
      where: { firebaseUid: req.user!.uid },
      select: { id: true },
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get the message and conversation to check permissions
    const message = await prisma.message.findFirst({
      where: { id: messageId },
      include: {
        conversation: {
          select: { user1Id: true, user2Id: true }
        }
      }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check if user is part of the conversation
    const isUser1 = message.conversation.user1Id === currentUser.id;
    const isUser2 = message.conversation.user2Id === currentUser.id;

    if (!isUser1 && !isUser2) {
      return res.status(403).json({ error: 'Not authorized to delete this message' });
    }

    // Update the appropriate delete flag
    const updateData = isUser1 
      ? { deletedByUser1: true }
      : { deletedByUser2: true };

    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: updateData,
      include: {
        conversation: {
          select: { user1Id: true, user2Id: true }
        }
      }
    });

    // Check if both users have deleted the message
    if (updatedMessage.deletedByUser1 && updatedMessage.deletedByUser2) {
      // Permanently delete the message
      await prisma.messageReceipt.deleteMany({
        where: { messageId },
      });
      
      await prisma.message.delete({
        where: { id: messageId },
      });

      return res.json({ 
        message: 'Message permanently deleted',
        permanentlyDeleted: true 
      });
    }

    res.json({ 
      message: 'Message deleted for you',
      permanentlyDeleted: false 
    });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// Get message receipts for a conversation
router.get('/conversation/:conversationId/receipts', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { conversationId } = req.params;

    const currentUser = await prisma.user.findUnique({
      where: { firebaseUid: req.user!.uid },
      select: { id: true },
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user is part of the conversation
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        OR: [
          { user1Id: currentUser.id },
          { user2Id: currentUser.id },
        ],
      },
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const receipts = await prisma.messageReceipt.findMany({
      where: {
        message: {
          conversationId,
        },
        userId: currentUser.id,
      },
      include: {
        message: {
          select: {
            id: true,
            senderId: true,
            content: true,
            createdAt: true,
          },
        },
      },
      orderBy: { timestamp: 'desc' },
    });

    res.json(receipts);
  } catch (error) {
    console.error('Get receipts error:', error);
    res.status(500).json({ error: 'Failed to get receipts' });
  }
});

export default router;