import { z } from 'zod';

export const authTokenSchema = z.object({
  email: z.string().trim().email('A valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

export type AuthTokenRequest = z.infer<typeof authTokenSchema>;
