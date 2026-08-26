import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (expected via --env-file)");
  process.exit(1);
}

const db = drizzle(neon(url));

try {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("migrations applied successfully");
} catch (err) {
  // drizzle-kit's own CLI swallows this, exiting non-zero with no output. The
  // actionable Postgres message lives on `cause`.
  console.error("migration failed");
  if (err?.query) console.error("statement:", String(err.query).trim());
  console.error(err?.cause?.message ?? err?.message ?? err);
  process.exit(1);
}
