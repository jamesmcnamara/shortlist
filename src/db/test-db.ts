import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/src/db/schema";
import { authUsers } from "@/src/db/neon-auth-schema";

export type TestDb = ReturnType<typeof makeDb>;

const makeDb = (client: PGlite) =>
  drizzle(client, { schema: { ...schema, authUsers } });

/**
 * An in-process Postgres so isolation is proven against real SQL rather than
 * against a mock that could agree with a buggy query.
 */
export async function createTestDb() {
  const client = new PGlite();
  const db = makeDb(client);

  await client.exec(`
    create schema if not exists neon_auth;

    create table neon_auth."user" (
      id uuid primary key,
      name text not null,
      email text not null
    );
  `);

  await migrate(db, { migrationsFolder: "drizzle" });

  return { db, client };
}
