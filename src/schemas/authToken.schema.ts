import { z } from 'zod';

export const authTokenSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('email'),
    email: z.string().trim().email('A valid email is required'),
    password: z.string().min(1, 'Password is required'),
  }),
  z.object({
    provider: z.literal('google'),
  }),
]);

export type AuthTokenRequest = z.infer<typeof authTokenSchema>;
