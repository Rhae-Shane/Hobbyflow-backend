import type { NextFunction, Request, Response } from 'express';
import { AppError, ErrorCodes } from '../lib/AppError';
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
  try {
    const header = req.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      log.debug({ path: req.path }, 'Missing or invalid authorization header');
      next(
        new AppError(
          401,
          ErrorCodes.AUTH_MISSING_HEADER,
          'Please sign in to continue',
        ),
      );
      return;
    }

    const token = header.slice('Bearer '.length).trim();

    if (!token) {
      log.debug({ path: req.path }, 'Missing access token');
      next(new AppError(401, ErrorCodes.AUTH_MISSING_TOKEN, 'Please sign in to continue'));
      return;
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      log.warn({ path: req.path, err: error }, 'Invalid or expired session');
      next(
        new AppError(401, ErrorCodes.AUTH_INVALID_SESSION, 'Your session has expired. Please sign in again.'),
      );
      return;
    }

    req.user = { id: data.user.id, email: data.user.email };
    log.debug({ userId: data.user.id, path: req.path }, 'Request authenticated');
    next();
  } catch (err) {
    log.error({ path: req.path, err }, 'Auth service error');
    next(
      new AppError(
        503,
        ErrorCodes.AUTH_SERVICE_UNAVAILABLE,
        'Sign-in service is temporarily unavailable. Please try again.',
      ),
    );
  }
}
