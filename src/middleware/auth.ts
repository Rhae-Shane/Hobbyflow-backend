import type { NextFunction, Request, Response } from 'express';
import { createChildLogger } from '../lib/logger';
import { supabaseAdmin } from '../lib/supabase';

const log = createChildLogger({ module: 'auth' });

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
    log.debug({ path: req.path }, 'Missing or invalid authorization header');
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = header.slice('Bearer '.length).trim();

  if (!token) {
    log.debug({ path: req.path }, 'Missing access token');
    res.status(401).json({ error: 'Missing access token' });
    return;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    log.warn({ path: req.path, err: error }, 'Invalid or expired session');
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }

  req.user = { id: data.user.id, email: data.user.email };
  log.debug({ userId: data.user.id, path: req.path }, 'Request authenticated');
  next();
}
