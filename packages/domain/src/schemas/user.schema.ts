import { z } from "zod";

/** Shared password strength rule for signup, reset, and change-password —
 *  one regex so the three forms can't drift apart. */
export function buildPasswordSchema(messages: {
  min: string;
  complexity: string;
}) {
  return z
    .string()
    .min(8, messages.min)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, messages.complexity);
}

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  emailVerified: z.boolean(),
  name: z.string().min(1).max(100),
  avatarUrl: z.string().url().nullable(),
  bio: z.string().max(500).nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type User = z.infer<typeof UserSchema>;
