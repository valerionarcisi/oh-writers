import { getWebRequest } from "@tanstack/start/server";
import type { UserId } from "@oh-writers/domain";

export type AppUser = {
  id: UserId;
  name: string;
  email: string;
};

export const getUser = async (): Promise<AppUser | null> => {
  const request = getWebRequest();
  if (!request) return null;
  // Dynamic import: auth.ts pulls in @oh-writers/db → postgres which
  // references Node-only globals (Buffer, net). Keeping this dynamic
  // ensures the browser bundle never loads the postgres driver.
  const { auth } = await import("./auth");
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  return {
    id: session.user.id as UserId,
    name: session.user.name,
    email: session.user.email,
  };
};

export const requireUser = async (): Promise<AppUser> => {
  const user = await getUser();
  if (!user) throw new Error("Unauthenticated");
  return user;
};
