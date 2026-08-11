import { pgSchema, text, uuid } from "drizzle-orm/pg-core";

const neonAuth = pgSchema("neon_auth");

// This definition is for querying Neon Auth; it is deliberately excluded from
// the Drizzle Kit schema entry point so its managed tables are not migrated.
export const authUsers = neonAuth.table("user", {
  id: uuid("id").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
});
