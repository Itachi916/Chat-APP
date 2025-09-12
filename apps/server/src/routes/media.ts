import { Router } from 'express';
import { requireAuth, AuthedRequest } from '../auth';
import { getPresignedUploadUrl, getPresignedDownloadUrl } from '../s3';
import { z } from 'zod';

const router = Router();

const uploadSchema = z.object({
  key: z.string().min(3),
  contentType: z.string().min(3)
});

router.post('/upload-url', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = uploadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });
  const url = await getPresignedUploadUrl(parsed.data.key, parsed.data.contentType);
  res.json({ url });
});

router.get('/download-url', requireAuth, async (req: AuthedRequest, res) => {
  const key = req.query.key as string;
  if (!key) return res.status(400).json({ error: 'Missing key' });
  const url = await getPresignedDownloadUrl(key);
  res.json({ url });
});

export default router;

