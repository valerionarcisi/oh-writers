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

// Collect all ports the dev server might bind to so Better Auth accepts
// local sign-in requests regardless of which port Vinxi picks.
const devOrigins = ["3000", "3001", "3002", "3003", "3004", "3005"].map(
  (p) => `http://localhost:${p}`,
);

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
  trustedOrigins: devOrigins,
});
