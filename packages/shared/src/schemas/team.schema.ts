import { z } from "zod";
import { TeamRoles } from "../constants.js";

export const TeamSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/),
  avatarUrl: z.string().url().nullable(),
  createdBy: z.string().uuid(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const TeamMemberSchema = z.object({
  id: z.string().uuid(),
  teamId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum([TeamRoles.OWNER, TeamRoles.EDITOR, TeamRoles.VIEWER]),
  invitedBy: z.string().uuid().nullable(),
  joinedAt: z.coerce.date(),
});

export const TeamInvitationSchema = z.object({
  id: z.string().uuid(),
  teamId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum([TeamRoles.OWNER, TeamRoles.EDITOR, TeamRoles.VIEWER]),
  token: z.string(),
  invitedBy: z.string().uuid(),
  expiresAt: z.coerce.date(),
  acceptedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
});

export type Team = z.infer<typeof TeamSchema>;
export type TeamMember = z.infer<typeof TeamMemberSchema>;
export type TeamInvitation = z.infer<typeof TeamInvitationSchema>;
