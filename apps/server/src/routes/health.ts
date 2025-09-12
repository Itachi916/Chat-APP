import { Router } from 'express';
import { requireAuth, AuthedRequest } from '../auth';
const router = Router();

router.get('/', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

router.get('/auth-check', requireAuth, (req: AuthedRequest, res) => {
  res.json({ ok: true, uid: req.user?.uid, ts: Date.now() });
});

export default router;

