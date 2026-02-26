import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema/index";

if (!process.env["DATABASE_URL"]) {
  throw new Error("DATABASE_URL is required");
}

const queryClient = postgres(process.env["DATABASE_URL"]);

export const db = drizzle(queryClient, { schema });

export type Db = typeof db;
