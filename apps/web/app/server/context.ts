import { getWebRequest } from "@tanstack/start/server";
import type { UserId } from "@oh-writers/shared";
import { auth } from "./auth";

export type AppUser = {
  id: UserId;
  name: string;
  email: string;
};

export const getUser = async (): Promise<AppUser | null> => {
  const request = getWebRequest();
  if (!request) return null;
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  return {
    id: session.user.id as UserId,
    name: session.user.name,
    email: session.user.email,
  };
};
