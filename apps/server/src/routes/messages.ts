import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../auth';
import { z } from 'zod';
import { containsPhoneNumber } from '../moderation';
import { getSocketServer } from '../socket';

const router = Router();

// For demo purposes, use in-memory store
type Message = {
  id: string;
  conversationId: string;
  fromUserId: string;
  toUserId: string;
  type: 'text' | 'image' | 'video';
  content: string; // text or s3 key
  createdAt: number;
  deliveredAt?: number;
  readAt?: number;
};

const conversations: Record<string, Message[]> = {};

const sendSchema = z.object({
  conversationId: z.string(),
  toUserId: z.string(),
  type: z.enum(['text', 'image', 'video']),
  content: z.string().min(1)
});

router.post('/send', requireAuth, (req: AuthedRequest, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });
  const { conversationId, toUserId, type, content } = parsed.data;
  const fromUserId = req.user!.uid;

  if (type === 'text' && containsPhoneNumber(content)) {
    return res.status(400).json({ error: 'Sharing phone numbers is not allowed' });
  }

  const msg: Message = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    conversationId,
    fromUserId,
    toUserId,
    type,
    content,
    createdAt: Date.now(),
    deliveredAt: Date.now()
  };
  conversations[conversationId] = conversations[conversationId] || [];
  conversations[conversationId].push(msg);
  try {
    const io = getSocketServer();
    // Notify only the recipient; the sender will append locally
    io.to(toUserId).emit('message', msg);
    // Notify sender that delivery has occurred
    io.to(fromUserId).emit('delivered', { conversationId, messageId: msg.id, deliveredAt: msg.deliveredAt });
  } catch {}
  res.json({ message: msg });
});

router.get('/history', requireAuth, (req: AuthedRequest, res) => {
  const conversationId = req.query.conversationId as string;
  if (!conversationId) return res.status(400).json({ error: 'Missing conversationId' });
  const msgs = (conversations[conversationId] || []).filter(
    (m) => m.fromUserId === req.user!.uid || m.toUserId === req.user!.uid
  );
  res.json({ messages: msgs });
});

router.post('/read', requireAuth, (req: AuthedRequest, res) => {
  const messageId = req.body.messageId as string;
  const conversationId = req.body.conversationId as string;
  const list = conversations[conversationId] || [];
  const message = list.find((m) => m.id === messageId && m.toUserId === req.user!.uid);
  if (!message) return res.status(404).json({ error: 'Message not found' });
  message.readAt = Date.now();
  try {
    const io = getSocketServer();
    io.to(message.fromUserId).emit('read', { conversationId, messageId, readAt: message.readAt });
  } catch {}
  res.json({ ok: true, readAt: message.readAt });
});

export default router;

