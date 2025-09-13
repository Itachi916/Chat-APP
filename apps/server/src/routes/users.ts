import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Get current user profile
router.get('/me', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { firebaseUid: req.user!.uid },
      select: {
        id: true,
        firebaseUid: true,
        email: true,
        username: true,
        displayName: true,
        avatar: true,
        status: true,
        lastSeen: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Check username availability
router.get('/check-username', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { username } = req.query;

    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Check if username is already taken by another user
    const existingUser = await prisma.user.findFirst({
      where: {
        username: username.trim(),
        firebaseUid: { not: req.user!.uid },
      },
    });

    res.json({ available: !existingUser });
  } catch (error) {
    console.error('Username check error:', error);
    res.status(500).json({ error: 'Failed to check username' });
  }
});

// Create or update user profile
router.post('/profile', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { username, displayName, avatar } = req.body;

    if (!username || !displayName) {
      return res.status(400).json({ error: 'Username and display name are required' });
    }

    // Check if username is already taken
    const existingUser = await prisma.user.findFirst({
      where: {
        username,
        firebaseUid: { not: req.user!.uid },
      },
    });

    if (existingUser) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const user = await prisma.user.upsert({
      where: { firebaseUid: req.user!.uid },
      update: {
        email: req.user!.email || '',
        username,
        displayName,
        avatar,
        updatedAt: new Date(),
      },
      create: {
        firebaseUid: req.user!.uid,
        email: req.user!.email || '',
        username,
        displayName,
        avatar,
      },
    });

    res.json({
      id: user.id,
      firebaseUid: user.firebaseUid,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar,
      status: user.status,
      lastSeen: user.lastSeen,
      createdAt: user.createdAt,
    });
  } catch (error) {
    console.error('Create/update user error:', error);
    res.status(500).json({ error: 'Failed to create/update user' });
  }
});

// Update user status
router.patch('/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { status } = req.body;

    if (!['ONLINE', 'OFFLINE', 'AWAY', 'BUSY'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const user = await prisma.user.update({
      where: { firebaseUid: req.user!.uid },
      data: {
        status,
        lastSeen: new Date(),
      },
    });

    res.json({ status: user.status, lastSeen: user.lastSeen });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Search users by username or display name
router.get('/search', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const users = await prisma.user.findMany({
      where: {
        AND: [
          { firebaseUid: { not: req.user!.uid } }, // Exclude current user
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
        lastSeen: true,
      },
      take: 20,
    });

    res.json(users);
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// Get user by ID
router.get('/:userId', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatar: true,
        status: true,
        lastSeen: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

export default router;
