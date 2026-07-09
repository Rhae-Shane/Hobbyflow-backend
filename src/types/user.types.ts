export type AppUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  provider: string | null;
  emailVerified: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
};
