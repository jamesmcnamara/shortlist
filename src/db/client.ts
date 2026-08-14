import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/src/db/schema";
import { authUsers } from "@/src/db/neon-auth-schema";

const databaseUrl = process.env.DATABASE_URL;

const createClient = () => {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }
  return drizzle(neon(databaseUrl), { schema: { ...schema, authUsers } });
};

export type DB = ReturnType<typeof createClient>;

let override: (() => DB) | null = null;

/**
 * Points `getDb` at another database. Tests use this to run the real queries
 * against an in-process Postgres.
 */
export function setDbForTesting(factory: (() => DB) | null) {
  override = factory;
}

export function getDb(): DB {
  return override ? override() : createClient();
}
