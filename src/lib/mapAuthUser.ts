import type { User } from '@supabase/supabase-js';
import type { AppUser } from '../types/user.types';

type UserMetadata = {
  full_name?: string;
  name?: string;
  avatar_url?: string;
  picture?: string;
  email_verified?: boolean;
};

export function mapAuthUser(user: User): AppUser {
  const metadata = (user.user_metadata ?? {}) as UserMetadata;
  const provider = user.app_metadata?.provider ?? user.app_metadata?.providers?.[0] ?? null;

  return {
    id: user.id,
    email: user.email ?? null,
    fullName: metadata.full_name ?? metadata.name ?? null,
    avatarUrl: metadata.avatar_url ?? metadata.picture ?? null,
    provider: typeof provider === 'string' ? provider : null,
    emailVerified: Boolean(metadata.email_verified ?? user.email_confirmed_at),
    createdAt: user.created_at ?? null,
    lastSignInAt: user.last_sign_in_at ?? null,
  };
}
