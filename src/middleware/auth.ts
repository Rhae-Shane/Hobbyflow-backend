import type { NextFunction, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';

export type AuthenticatedRequest = Request & {
  user?: { id: string; email?: string };
};

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = header.slice('Bearer '.length).trim();

  if (!token) {
    res.status(401).json({ error: 'Missing access token' });
    return;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }

  req.user = { id: data.user.id, email: data.user.email };
  next();
}
