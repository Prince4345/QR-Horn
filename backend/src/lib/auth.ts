import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from './supabase.js';
import { prisma } from './prisma.js';

export interface AuthRequest extends Request {
  authUserId?: string;
  ownerId?: string;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!supabaseAdmin) {
      res.status(503).json({ error: 'Auth not configured on server' });
      return;
    }

    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing authorization token' });
      return;
    }

    const token = header.slice(7);
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    req.authUserId = data.user.id;

    const owner = await prisma.owner.findUnique({
      where: { authUserId: data.user.id },
      select: { id: true },
    });

    if (owner) req.ownerId = owner.id;

    next();
  } catch (err) {
    console.error('requireAuth:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

export async function requireOwner(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.ownerId) {
    res.status(403).json({ error: 'Complete account setup first' });
    return;
  }
  next();
}
