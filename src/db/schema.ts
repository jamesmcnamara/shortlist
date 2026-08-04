import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const movies = pgTable("movies", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  title: text().notNull(),
  year: integer(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export type Movie = typeof movies.$inferSelect;
