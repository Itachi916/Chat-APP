import { Request, Response, NextFunction } from 'express';
import { firebaseAuth } from './firebaseAdmin';

export interface AuthedRequest extends Request {
  user?: { uid: string; email?: string | null };
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }
  const token = authHeader.slice('Bearer '.length);
  try {
    const decoded = await firebaseAuth.verifyIdToken(token);
    req.user = { uid: decoded.uid, email: decoded.email ?? null };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

