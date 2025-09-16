import { Router } from 'express';
import { requireAuth, AuthedRequest } from '../auth';
import { forceCleanupAllUsers } from '../socket';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

router.get('/auth-check', requireAuth, (req: AuthedRequest, res) => {
  res.json({ ok: true, uid: req.user?.uid, ts: Date.now() });
});

// Manual cleanup endpoint to fix stale online users
router.post('/cleanup-users', async (req, res) => {
  try {
    await forceCleanupAllUsers();
    res.json({ 
      status: 'OK', 
      message: 'User cleanup completed',
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    console.error('Cleanup endpoint error:', error);
    res.status(500).json({ 
      status: 'ERROR', 
      message: 'Cleanup failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;

