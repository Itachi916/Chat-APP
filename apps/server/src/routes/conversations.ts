import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { getSocketServer } from '../socket';

const router = Router();

// Get all conversations for current user
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const currentUser = await prisma.user.findUnique({
      where: { firebaseUid: req.user!.uid },
      select: { id: true },
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [
          { user1Id: currentUser.id },
          { user2Id: currentUser.id },
        ],
      },
      include: {
        user1: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
            status: true,
          },
        },
        user2: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
            status: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                displayName: true,
              },
            },
            media: {
              select: {
                id: true,
                fileType: true,
                s3Url: true,
              },
            },
          },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    // Format conversations for response
    const formattedConversations = await Promise.all(conversations.map(async (conv) => {
      const otherUser = conv.user1Id === currentUser.id ? conv.user2 : conv.user1;
      const isUser1 = conv.user1Id === currentUser.id;
      
      // Get the last non-deleted message for this user
      const lastMessage = await prisma.message.findFirst({
        where: {
          conversationId: conv.id,
          // Filter out messages deleted by the current user
          ...(isUser1 ? { deletedByUser1: false } : { deletedByUser2: false })
        },
        orderBy: { createdAt: 'desc' },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
          media: {
            select: {
              id: true,
              fileType: true,
              s3Url: true,
            },
          },
        },
      });

      // Get the last read timestamp for this user in this conversation
      const readState = await prisma.conversationReadState.findUnique({
        where: {
          conversationId_userId: {
            conversationId: conv.id,
            userId: currentUser.id
          }
        }
      });

      // Count unread messages (messages created after last read time, not sent by current user, and not deleted by current user)
      const unreadCount = await prisma.message.count({
        where: {
          conversationId: conv.id,
          senderId: { not: currentUser.id }, // Not sent by current user
          createdAt: { gt: readState?.readAt || new Date(0) }, // Created after last read time
          // Filter out messages deleted by the current user
          ...(isUser1 ? { deletedByUser1: false } : { deletedByUser2: false })
        }
      });
      
      return {
        id: conv.id,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        lastMessageAt: lastMessage?.createdAt || conv.createdAt,
        unreadCount,
        otherUser: {
          id: otherUser.id,
          username: otherUser.username,
          displayName: otherUser.displayName,
          avatar: otherUser.avatar,
          status: otherUser.status,
        },
        lastMessage: lastMessage || null,
      };
    }));

    res.json(formattedConversations);
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to get conversations' });
  }
});

// Mark conversation as read
router.post('/:conversationId/read', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { conversationId } = req.params;
    
    // Get current user from database
    const currentUser = await prisma.user.findUnique({
      where: { firebaseUid: req.user!.uid },
      select: { id: true },
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify user is part of this conversation
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        OR: [
          { user1Id: currentUser.id },
          { user2Id: currentUser.id }
        ]
      }
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Upsert read state (create or update)
    await prisma.conversationReadState.upsert({
      where: {
        conversationId_userId: {
          conversationId,
          userId: currentUser.id
        }
      },
      update: {
        readAt: new Date()
      },
      create: {
        conversationId,
        userId: currentUser.id,
        readAt: new Date()
      }
    });

    res.json({ message: 'Conversation marked as read' });
  } catch (error) {
    console.error('Mark conversation as read error:', error);
    res.status(500).json({ error: 'Failed to mark conversation as read' });
  }
});

// Get specific conversation by ID
router.get('/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const currentUser = await prisma.user.findUnique({
      where: { firebaseUid: req.user!.uid },
      select: { id: true },
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: req.params.id,
        OR: [
          { user1Id: currentUser.id },
          { user2Id: currentUser.id },
        ],
      },
      include: {
        user1: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
            status: true,
          },
        },
        user2: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
            status: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            sender: {
              select: {
                id: true,
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
                s3Url: true,
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
        },
      },
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const otherUser = conversation.user1Id === currentUser.id ? conversation.user2 : conversation.user1;

    res.json({
      id: conversation.id,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      lastMessageAt: conversation.lastMessageAt,
      otherUser: {
        id: otherUser.id,
        username: otherUser.username,
        displayName: otherUser.displayName,
        avatar: otherUser.avatar,
        status: otherUser.status,
      },
      messages: conversation.messages.reverse(), // Reverse to show oldest first
    });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

// Create or get existing conversation with another user
router.post('/start', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { otherUserId } = req.body;

    if (!otherUserId) {
      return res.status(400).json({ error: 'Other user ID is required' });
    }

    const currentUser = await prisma.user.findUnique({
      where: { firebaseUid: req.user!.uid },
      select: { id: true },
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (currentUser.id === otherUserId) {
      return res.status(400).json({ error: 'Cannot start conversation with yourself' });
    }

    // Check if other user exists
    const otherUser = await prisma.user.findUnique({
      where: { id: otherUserId },
      select: { id: true, username: true, displayName: true, avatar: true, status: true },
    });

    if (!otherUser) {
      return res.status(404).json({ error: 'Other user not found' });
    }

    // Check if conversation already exists
    const existingConversation = await prisma.conversation.findFirst({
      where: {
        OR: [
          { user1Id: currentUser.id, user2Id: otherUserId },
          { user1Id: otherUserId, user2Id: currentUser.id },
        ],
      },
      include: {
        user1: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
            status: true,
          },
        },
        user2: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
            status: true,
          },
        },
      },
    });

    if (existingConversation) {
      const otherUserInConv = existingConversation.user1Id === currentUser.id 
        ? existingConversation.user2 
        : existingConversation.user1;

      return res.json({
        id: existingConversation.id,
        createdAt: existingConversation.createdAt,
        updatedAt: existingConversation.updatedAt,
        lastMessageAt: existingConversation.lastMessageAt,
        otherUser: otherUserInConv,
        isNew: false,
      });
    }

    // Create new conversation
    const conversation = await prisma.conversation.create({
      data: {
        user1Id: currentUser.id,
        user2Id: otherUserId,
      },
      include: {
        user1: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
            status: true,
          },
        },
        user2: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
            status: true,
          },
        },
      },
    });

    const otherUserInConv = conversation.user1Id === currentUser.id 
      ? conversation.user2 
      : conversation.user1;

    // Format conversation for socket emission
    const formattedConversation = {
      id: conversation.id,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      lastMessageAt: conversation.lastMessageAt,
      otherUser: otherUserInConv,
      isNew: true,
    };

    // Emit conversation-created event to both users
    try {
      const io = getSocketServer();
      
      // Get Firebase UIDs for both users
      const [user1Firebase, user2Firebase] = await Promise.all([
        prisma.user.findUnique({ where: { id: conversation.user1Id }, select: { firebaseUid: true } }),
        prisma.user.findUnique({ where: { id: conversation.user2Id }, select: { firebaseUid: true } })
      ]);

      if (user1Firebase && user2Firebase) {
        // Emit to both users
        io.to(`user:${user1Firebase.firebaseUid}`).emit('conversation-created', formattedConversation);
        io.to(`user:${user2Firebase.firebaseUid}`).emit('conversation-created', formattedConversation);
      }
    } catch (socketError) {
      console.error('Socket emission error:', socketError);
      // Don't fail the request if socket emission fails
    }

    res.status(201).json(formattedConversation);
  } catch (error) {
    console.error('Start conversation error:', error);
    res.status(500).json({ error: 'Failed to start conversation' });
  }
});

// Delete conversation
router.delete('/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const currentUser = await prisma.user.findUnique({
      where: { firebaseUid: req.user!.uid },
      select: { id: true },
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: req.params.id,
        OR: [
          { user1Id: currentUser.id },
          { user2Id: currentUser.id },
        ],
      },
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Delete all messages in the conversation first
    await prisma.message.deleteMany({
      where: { conversationId: conversation.id },
    });

    // Delete the conversation
    await prisma.conversation.delete({
      where: { id: conversation.id },
    });

    res.json({ message: 'Conversation deleted successfully' });
  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

// Search for users to start conversations with
router.get('/search/users', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const currentUser = await prisma.user.findUnique({
      where: { firebaseUid: req.user!.uid },
      select: { id: true },
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: currentUser.id } }, // Exclude current user
          {
            OR: [
              { username: { contains: q, mode: 'insensitive' } },
              { displayName: { contains: q, mode: 'insensitive' } },
            ],
          },
        ],
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatar: true,
        status: true,
      },
      take: 20,
    });

    res.json(users);
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

export default router;