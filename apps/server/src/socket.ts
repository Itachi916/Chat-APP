import type { Server as SocketIOServer } from 'socket.io';
import { prisma } from './lib/prisma';

let ioInstance: SocketIOServer | null = null;

export function setSocketServer(io: SocketIOServer) {
  ioInstance = io;
}

export function getSocketServer(): SocketIOServer {
  if (!ioInstance) {
    throw new Error('Socket.IO server not initialized');
  }
  return ioInstance;
}

// Socket event handlers for real-time chat
export function setupSocketHandlers(io: SocketIOServer) {
  io.on('connection', async (socket) => {
    // Don't log anonymous connections - only log when they authenticate

    // Join user to their personal room
    socket.on('join', async (userId: string) => {
      try {
        const user = await prisma.user.findUnique({
          where: { firebaseUid: userId },
          select: { id: true, username: true, displayName: true },
        });

        if (user) {
          socket.data.userId = user.id;
          socket.data.firebaseUid = userId;
          socket.join(user.id);
          socket.join(`user:${user.id}`);
          socket.join(`user:${userId}`); // Join Firebase UID room for conversation updates
          
          // Update user status to online
          await prisma.user.update({
            where: { id: user.id },
            data: { 
              status: 'ONLINE',
              lastSeen: new Date(),
            },
          });

          // Notify all friends that this user is now online
          const conversations = await prisma.conversation.findMany({
            where: {
              OR: [
                { user1Id: user.id },
                { user2Id: user.id }
              ]
            },
            include: {
              user1: { select: { id: true, firebaseUid: true } },
              user2: { select: { id: true, firebaseUid: true } }
            }
          });

          // Notify each friend about the online status
          for (const conv of conversations) {
            const friendId = conv.user1Id === user.id ? conv.user2.id : conv.user1.id;
            const friendFirebaseUid = conv.user1Id === user.id ? conv.user2.firebaseUid : conv.user1.firebaseUid;
            
            // Emit to the friend's Firebase UID room
            io.to(`user:${friendFirebaseUid}`).emit('user-status-updated', {
              userId: user.id,
              firebaseUid: userId,
              username: user.username,
              displayName: user.displayName,
              status: 'ONLINE',
              lastSeen: new Date()
            });
          }

          console.log(`✅ User logged in: @${user.username} (${user.displayName})`);
        }
      } catch (error) {
        console.error('Join error:', error);
      }
    });

    // Join conversation room
    socket.on('join-conversation', async (conversationId: string) => {
      try {
        console.log('User joining conversation:', conversationId, 'userId:', socket.data.userId);
        if (!socket.data.userId) {
          console.log('No userId found, cannot join conversation');
          return;
        }

        // Verify user is part of the conversation
        const conversation = await prisma.conversation.findFirst({
          where: {
            id: conversationId,
            OR: [
              { user1Id: socket.data.userId },
              { user2Id: socket.data.userId },
            ],
          },
        });

        if (conversation) {
          socket.join(`conversation:${conversationId}`);
          console.log('User successfully joined conversation:', conversationId);
        } else {
          console.log('User not authorized to join conversation:', conversationId);
        }
      } catch (error) {
        console.error('Join conversation error:', error);
      }
    });

    // Leave conversation room
    socket.on('leave-conversation', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
      // User left conversation
    });

    // Handle typing indicators
    socket.on('typing', async (data: { conversationId: string; isTyping: boolean }) => {
      if (!socket.data.userId) return;
      
      try {
        // Get user info for typing indicator
        const user = await prisma.user.findUnique({
          where: { id: socket.data.userId },
          select: { id: true, username: true, displayName: true, firebaseUid: true }
        });

        if (!user) return;

        // Get the other user in this conversation
        const conversation = await prisma.conversation.findFirst({
          where: { id: data.conversationId },
          include: {
            user1: { select: { id: true, firebaseUid: true } },
            user2: { select: { id: true, firebaseUid: true } }
          }
        });

        if (!conversation) return;

        const otherUser = conversation.user1Id === user.id ? conversation.user2 : conversation.user1;
        
        // Emit typing indicator to the other user's Firebase UID room
        io.to(`user:${otherUser.firebaseUid}`).emit('typing', {
          userId: socket.data.userId,
          username: user.username,
          displayName: user.displayName,
          isTyping: data.isTyping,
          conversationId: data.conversationId,
        });

        // Also emit to conversation room for real-time updates
        socket.to(`conversation:${data.conversationId}`).emit('typing', {
          userId: socket.data.userId,
          username: user.username,
          displayName: user.displayName,
          isTyping: data.isTyping,
          conversationId: data.conversationId,
        });
      } catch (error) {
        console.error('Typing indicator error:', error);
      }
    });

    // Handle message sending
    socket.on('send-message', async (data: {
      conversationId: string;
      content?: string;
      messageType: string;
      mediaIds?: string[];
      replyToId?: string;
    }) => {
      try {
        console.log('Received send-message event:', data);
        if (!socket.data.userId) {
          console.log('No userId found, ignoring message');
          return;
        }

        const { conversationId, content, messageType, mediaIds, replyToId } = data;

        // Verify user is part of the conversation
        const conversation = await prisma.conversation.findFirst({
          where: {
            id: conversationId,
            OR: [
              { user1Id: socket.data.userId },
              { user2Id: socket.data.userId },
            ],
          },
        });

        if (!conversation) {
          socket.emit('error', { message: 'Conversation not found' });
          return;
        }

        // Get the other user in the conversation
        const otherUserId = conversation.user1Id === socket.data.userId 
          ? conversation.user2Id 
          : conversation.user1Id;

        // Create the message
        const message = await prisma.message.create({
          data: {
            conversationId,
            senderId: socket.data.userId,
            content,
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
                fileSize: true,
                s3Key: true,
                s3Url: true,
                thumbnailUrl: true,
                width: true,
                height: true,
                duration: true,
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
              userId: socket.data.userId,
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

        // Emit message to all participants in the conversation
        console.log('Emitting new-message to conversation:', conversationId);
        io.to(`conversation:${conversationId}`).emit('new-message', message);

        // Emit conversation update to all participants
        io.to(`conversation:${conversationId}`).emit('conversation-updated', {
          conversationId,
          lastMessage: message,
          lastMessageAt: new Date(),
        });

      } catch (error) {
        console.error('Send message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle message deletion
    socket.on('delete-message', async (data: { messageId: string }) => {
      try {
        if (!socket.data.userId) return;

        const { messageId } = data;

        // Get the message and conversation to check permissions
        const message = await prisma.message.findFirst({
          where: { id: messageId },
          include: {
            conversation: {
              select: { user1Id: true, user2Id: true, id: true }
            }
          }
        });

        if (!message) {
          socket.emit('error', { message: 'Message not found' });
          return;
        }

        // Check if user is part of the conversation
        const isUser1 = message.conversation.user1Id === socket.data.userId;
        const isUser2 = message.conversation.user2Id === socket.data.userId;

        if (!isUser1 && !isUser2) {
          socket.emit('error', { message: 'Not authorized to delete this message' });
          return;
        }

        // Update the appropriate delete flag
        const updateData = isUser1 
          ? { deletedByUser1: true }
          : { deletedByUser2: true };

        const updatedMessage = await prisma.message.update({
          where: { id: messageId },
          data: updateData,
        });

        // Only emit to the current user (private deletion)
        socket.emit('message-deleted', {
          messageId,
          deletedByUser1: updatedMessage.deletedByUser1,
          deletedByUser2: updatedMessage.deletedByUser2,
          permanentlyDeleted: false
        });

        // Update conversation list for the current user
        socket.emit('conversation-list-updated', {
          conversationId: message.conversation.id,
          messageDeleted: true
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

          // Emit permanent deletion event to both users
          const [user1Firebase, user2Firebase] = await Promise.all([
            prisma.user.findUnique({ where: { id: message.conversation.user1Id }, select: { firebaseUid: true } }),
            prisma.user.findUnique({ where: { id: message.conversation.user2Id }, select: { firebaseUid: true } })
          ]);

          if (user1Firebase && user2Firebase) {
            io.to(`user:${user1Firebase.firebaseUid}`).emit('message-deleted', {
              messageId,
              permanentlyDeleted: true
            });
            io.to(`user:${user2Firebase.firebaseUid}`).emit('message-deleted', {
              messageId,
              permanentlyDeleted: true
            });
          }
        }

      } catch (error) {
        console.error('Delete message error:', error);
        socket.emit('error', { message: 'Failed to delete message' });
      }
    });

    // Handle message receipt updates
    socket.on('update-receipt', async (data: {
      messageId: string;
      status: 'SENT' | 'DELIVERED' | 'READ';
    }) => {
      try {
        if (!socket.data.userId) return;

        const { messageId, status } = data;

        const receipt = await prisma.messageReceipt.upsert({
          where: {
            messageId_userId: {
              messageId,
              userId: socket.data.userId,
            },
          },
          update: {
            status,
            timestamp: new Date(),
          },
          create: {
            messageId,
            userId: socket.data.userId,
            status,
          },
        });

        // Emit receipt update to conversation participants
        const message = await prisma.message.findUnique({
          where: { id: messageId },
          select: { conversationId: true },
        });

        if (message) {
          io.to(`conversation:${message.conversationId}`).emit('receipt-updated', {
            messageId,
            userId: socket.data.userId,
            status: receipt.status,
            timestamp: receipt.timestamp,
          });
        }
      } catch (error) {
        console.error('Update receipt error:', error);
      }
    });

    // Handle user status updates
    socket.on('update-status', async (status: 'ONLINE' | 'OFFLINE' | 'AWAY' | 'BUSY') => {
      try {
        if (!socket.data.userId) return;

        await prisma.user.update({
          where: { id: socket.data.userId },
          data: {
            status,
            lastSeen: new Date(),
          },
        });

        // Emit status update to all user's conversations
        const conversations = await prisma.conversation.findMany({
          where: {
            OR: [
              { user1Id: socket.data.userId },
              { user2Id: socket.data.userId },
            ],
          },
          select: { id: true },
        });

        conversations.forEach((conv: { id: string }) => {
          io.to(`conversation:${conv.id}`).emit('user-status-updated', {
            userId: socket.data.userId,
            status,
            lastSeen: new Date(),
          });
        });
      } catch (error) {
        console.error('Update status error:', error);
      }
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
      try {
        if (socket.data.userId) {
          // Update user status to offline
          await prisma.user.update({
            where: { id: socket.data.userId },
            data: {
              status: 'OFFLINE',
              lastSeen: new Date(),
            },
          });

          // Notify all friends that this user is now offline
          const conversations = await prisma.conversation.findMany({
            where: {
              OR: [
                { user1Id: socket.data.userId },
                { user2Id: socket.data.userId }
              ]
            },
            include: {
              user1: { select: { id: true, firebaseUid: true } },
              user2: { select: { id: true, firebaseUid: true } }
            }
          });

          // Notify each friend about the offline status
          for (const conv of conversations) {
            const friendId = conv.user1Id === socket.data.userId ? conv.user2.id : conv.user1.id;
            const friendFirebaseUid = conv.user1Id === socket.data.userId ? conv.user2.firebaseUid : conv.user1.firebaseUid;
            
            // Emit to the friend's Firebase UID room
            io.to(`user:${friendFirebaseUid}`).emit('user-status-updated', {
              userId: socket.data.userId,
              firebaseUid: socket.data.firebaseUid,
              status: 'OFFLINE',
              lastSeen: new Date()
            });
          }

          // Get user info for better logging
          const user = await prisma.user.findUnique({
            where: { id: socket.data.userId },
            select: { displayName: true, username: true },
          });
          
          console.log(`❌ User logged out: @${user?.username || 'unknown'} (${user?.displayName || 'Unknown User'})`);
        }
      } catch (error) {
        console.error('Disconnect error:', error);
      }
    });
  });
}

