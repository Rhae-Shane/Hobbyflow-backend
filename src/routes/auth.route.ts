import { Router } from 'express';
import { env } from '../config/env';
import { AppError, ErrorCodes } from '../lib/AppError';
import { createChildLogger } from '../lib/logger';
import { supabaseAuth } from '../lib/supabase';
import { toValidationError } from '../lib/validationError';
import { authTokenSchema } from '../schemas/authToken.schema';

const log = createChildLogger({ module: 'auth.route' });

export const authRouter = Router();

function authCallbackUrl(): string {
  return `http://localhost:${env.PORT}/api/v1/auth/callback`;
}

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
  user: { id: string; email?: string };
}) {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresIn: session.expires_in ?? 3600,
    userId: session.user.id,
    email: session.user.email,
  };
}

authRouter.post('/token', async (req, res, next) => {
  const parsed = authTokenSchema.safeParse(req.body);

  if (!parsed.success) {
    return next(toValidationError(parsed.error));
  }

  try {
    ensureAuthConfigured();

    if (parsed.data.provider === 'email') {
      const { email, password } = parsed.data;
      const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });

      if (error || !data.session) {
        log.warn({ email, err: error }, 'Email sign-in failed');
        return next(
          new AppError(401, ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Invalid email or password'),
        );
      }

      log.info({ userId: data.session.user.id }, 'Email sign-in token issued');
      return res.status(200).json(formatTokenResponse(data.session));
    }

    const redirectTo = authCallbackUrl();
    const { data, error } = await supabaseAuth.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error || !data.url) {
      log.error({ err: error }, 'Google OAuth URL generation failed');
      return next(
        new AppError(
          503,
          ErrorCodes.AUTH_OAUTH_FAILED,
          'Could not start Google sign-in. Check Supabase Google provider settings.',
        ),
      );
    }

    log.info({ redirectTo }, 'Google OAuth URL issued');
    return res.status(200).json({
      provider: 'google',
      url: data.url,
      redirectTo,
      message: 'Open the URL in a browser. After sign-in you will land on the callback page with your token.',
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/callback', (_req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>HobbyFlow — Sign in</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; }
    pre { background: #f4f4f5; padding: 1rem; overflow-x: auto; border-radius: 8px; }
    .hint { color: #52525b; }
  </style>
</head>
<body>
  <h1>Sign-in complete</h1>
  <p class="hint">Copy <code>accessToken</code> and use it as <code>Authorization: Bearer &lt;token&gt;</code> in the API docs.</p>
  <pre id="output">Waiting for token...</pre>
  <script>
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const accessToken = params.get('access_token') || hash.get('access_token');
    const refreshToken = params.get('refresh_token') || hash.get('refresh_token');
    const expiresIn = params.get('expires_in') || hash.get('expires_in');
    const output = document.getElementById('output');

    if (accessToken) {
      output.textContent = JSON.stringify({
        accessToken,
        refreshToken,
        expiresIn: expiresIn ? Number(expiresIn) : 3600,
      }, null, 2);
    } else {
      output.textContent = 'No token found. Start Google sign-in from POST /api/v1/auth/token with provider "google".';
    }
  </script>
</body>
</html>`);
});
