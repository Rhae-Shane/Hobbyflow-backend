import { Router } from 'express';
import { env } from '../config/env';
import { AppError, ErrorCodes } from '../lib/AppError';
import { createChildLogger } from '../lib/logger';
import { mapAuthUser } from '../lib/mapAuthUser';
import { supabaseAuth } from '../lib/supabase';
import { toValidationError } from '../lib/validationError';
import { authTokenSchema } from '../schemas/authToken.schema';

const log = createChildLogger({ module: 'auth.route' });

export const authRouter = Router();

function ensureAuthConfigured(): void {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new AppError(
      503,
      ErrorCodes.AUTH_SERVICE_UNAVAILABLE,
      'Sign-in service is not configured on this server.',
    );
  }
}

function formatTokenResponse(session: {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  user: Parameters<typeof mapAuthUser>[0];
}) {
  const user = mapAuthUser(session.user);

  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresIn: session.expires_in ?? 3600,
    userId: user.id,
    email: user.email,
    user,
  };
}

authRouter.post('/token', async (req, res, next) => {
  const parsed = authTokenSchema.safeParse(req.body);

  if (!parsed.success) {
    return next(toValidationError(parsed.error));
  }

  try {
    ensureAuthConfigured();

    const { email, password } = parsed.data;
    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      log.warn({ email, err: error }, 'Email sign-in failed');
      return next(
        new AppError(401, ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Invalid email or password'),
      );
    }

    log.info({ userId: data.session.user.id }, 'Access token issued');
    return res.status(200).json(formatTokenResponse(data.session));
  } catch (error) {
    next(error);
  }
});
