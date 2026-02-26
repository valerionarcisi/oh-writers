import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@oh-writers/db";
import {
  users,
  sessions,
  accounts,
  verifications,
} from "@oh-writers/db/schema";

const socialProviders: Record<
  string,
  { clientId: string; clientSecret: string }
> = {};

if (process.env["GOOGLE_CLIENT_ID"] && process.env["GOOGLE_CLIENT_SECRET"]) {
  socialProviders["google"] = {
    clientId: process.env["GOOGLE_CLIENT_ID"],
    clientSecret: process.env["GOOGLE_CLIENT_SECRET"],
  };
}

if (process.env["GITHUB_CLIENT_ID"] && process.env["GITHUB_CLIENT_SECRET"]) {
  socialProviders["github"] = {
    clientId: process.env["GITHUB_CLIENT_ID"],
    clientSecret: process.env["GITHUB_CLIENT_SECRET"],
  };
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  socialProviders,
});
