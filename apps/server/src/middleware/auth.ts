import { Request, Response, NextFunction } from 'express';
import { firebaseAuth } from '../firebaseAdmin';
import { prisma } from '../lib/prisma';

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    sessionId?: string;
  };
  file?: Express.Multer.File;
}

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decodedToken = await firebaseAuth.verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      sessionId: decodedToken.session_id || decodedToken.iat?.toString(), // Use session_id or iat as fallback
    };

    next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Enhanced middleware for conversation access with session validation
export const validateConversationAccess = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { conversationId } = req.params;
    const sessionId = req.headers['x-session-id'] as string;
    
    if (!conversationId) {
      return res.status(400).json({ error: 'Conversation ID required' });
    }

    // Get current user from database
    const currentUser = await prisma.user.findUnique({
      where: { firebaseUid: req.user!.uid },
      select: { id: true, firebaseUid: true },
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user has access to this conversation
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
      // User is not part of this conversation - logout for security
      console.log(`🚨 Security Alert: User ${currentUser.firebaseUid} attempted unauthorized access to conversation ${conversationId}`);
      return res.status(403).json({ 
        error: 'Unauthorized access detected. Session terminated for security.',
        logout: true,
        reason: 'unauthorized_conversation_access'
      });
    }

    // Optional: Validate session ID if provided
    if (sessionId && req.user?.sessionId && sessionId !== req.user.sessionId) {
      console.log(`🚨 Security Alert: Session ID mismatch for user ${currentUser.firebaseUid}`);
      return res.status(403).json({ 
        error: 'Session validation failed. Please login again.',
        logout: true,
        reason: 'session_mismatch'
      });
    }

    next();
  } catch (error) {
    console.error('Conversation access validation error:', error);
    return res.status(500).json({ error: 'Access validation failed' });
  }
};

// Middleware to force logout on security violations
export const handleSecurityViolation = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  // Check if previous middleware flagged a security violation
  if (res.locals.securityViolation) {
    return res.status(403).json({
      error: 'Security violation detected. Session terminated.',
      logout: true,
      reason: res.locals.securityReason
    });
  }
  next();
};
