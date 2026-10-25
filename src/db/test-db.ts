import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { SQLWrapper } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import * as schema from "@/src/db/schema";
import { authUsers } from "@/src/db/neon-auth-schema";

export type TestDb = ReturnType<typeof makeDb>;

const makeDb = (client: PGlite) => {
  const db = drizzle(client, { schema: { ...schema, authUsers } });
  const dialect = new PgDialect();
  // PGlite has transactions but no batch API; run the same write statements in order.
  const batch = (queries: readonly SQLWrapper[]) =>
    client.transaction(async (tx) => {
      for (const query of queries) {
        const { sql, params } = dialect.sqlToQuery(query.getSQL());
        await tx.query(sql, params);
      }
    });
  return Object.assign(db, { batch });
};

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
      email text not null,
      "emailVerified" boolean not null,
      image text,
      "createdAt" timestamptz not null,
      "updatedAt" timestamptz not null
    );
  `);

  await migrate(db, { migrationsFolder: "drizzle" });

  return { db, client };
}
