import { integer, real, pgSchema, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

const neonAuth = pgSchema("neon_auth");
export const authUsers = neonAuth.table("user", {
  id: uuid("id").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),

});

export const movies = pgTable("movies", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  tmdbId: integer("tmdb_id").unique(),
  title: text().notNull(),
  posterUrl: text("poster_url"),
  description: text(),
  year: integer(),
  runtime: integer(),
  tmdbRating: real("tmdb_rating"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const nominations = pgTable("nominations", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid("user_id").notNull().references(() => authUsers.id),
  movieId: integer("movie_id").notNull().references(() => movies.id),
  comment: text("comment"),
  month: integer().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const votes = pgTable("votes", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid("user_id").notNull().references(() => authUsers.id),
  nominationId: integer("nomination_id").notNull().references(() => nominations.id),
  comment: text("comment"),
  month: integer().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

// Nomination comment
export const nomcoms = pgTable("nomcoms", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid("user_id").notNull().references(() => authUsers.id),
  nominationId: integer("nomination_id").notNull().references(() => nominations.id),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const seen = pgTable("seen", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid("user_id").notNull().references(() => authUsers.id),
  movieId: integer("movie_id").notNull().references(() => movies.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});


export const nominationsRelations = relations(nominations, ({ one, many }) => ({
  movie: one(movies, { fields: [nominations.movieId], references: [movies.id] }),
  votes: many(votes),
  nomcoms: many(nomcoms),
  nominator: one(authUsers, { fields: [nominations.userId], references: [authUsers.id] }),
}));

export const votesRelations = relations(votes, ({ one }) => ({
  nomination: one(nominations, { fields: [votes.nominationId], references: [nominations.id] }),
}));

export const nomcomsRelations = relations(nomcoms, ({ one }) => ({
  nomination: one(nominations, { fields: [nomcoms.nominationId], references: [nominations.id] }),
  commenter: one(authUsers, { fields: [nomcoms.userId], references: [authUsers.id] }),
}));


export type Movie = typeof movies.$inferSelect;
export type RawNomination = typeof nominations.$inferSelect
export type Nomination = RawNomination & { movie: Movie, votes: Vote[], nomcoms: NomCom[], nominator: User };
export type Vote = typeof votes.$inferSelect;
export type NomCom = typeof nomcoms.$inferSelect & { commenter: User };
export type Seen = typeof seen.$inferSelect;

export interface User {
  id: string;
  name: string;
  email: string;
}