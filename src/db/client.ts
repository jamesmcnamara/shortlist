import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/src/db/schema";
import { authUsers } from "@/src/db/neon-auth-schema";

const databaseUrl = process.env.DATABASE_URL;

export type DB = ReturnType<typeof getDb>;

export function getDb() {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  return drizzle(neon(databaseUrl), { schema: { ...schema, authUsers } });
}
