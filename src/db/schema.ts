import {
  boolean,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { authUsers } from "./neon-auth-schema";
import type { MovieDetails as _MovieDetails } from "@lorenzopant/tmdb";
import type { JustWatchAvailability } from "@/app/lib/justwatch-types";
import type { BoxOffice } from "@/app/lib/box-office";

/** A theatre is a shared watch list for a group. */
export const theatres = pgTable("theatres", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  watchlistFor: uuid("watchlist_for")
    .unique()
    .references(() => authUsers.id),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => authUsers.id),
  inviteCode: text("invite_code").notNull().unique(),
  // A separate link that grants the "admin" role on join instead of "member".
  adminInviteCode: text("admin_invite_code").notNull().unique(),
  // Grants read-only access to anyone with the link, signed in or not.
  shareCode: text("share_code")
    .notNull()
    .unique()
    .default(sql`replace(gen_random_uuid()::text, '-', '')`),
  description: text(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const theatreMembers = pgTable(
  "theatre_members",
  {
    theatreId: uuid("theatre_id")
      .notNull()
      .references(() => theatres.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id),
    role: text().notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.theatreId, table.userId] }),
    index("theatre_members_user_idx").on(table.userId),
  ],
);

export const movies = pgTable("movies", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  tmdbId: integer("tmdb_id").unique(),
  details: jsonb("details").notNull(),
  ratings: jsonb("ratings").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    endpoint: text().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    p256dh: text().notNull(),
    auth: text().notNull(),
  },
  (table) => [index("subscriptions_user_idx").on(table.userId)],
);

export const notifications = pgTable(
  "notifications",
  {
    theatreId: uuid("theatre_id").notNull(),
    userId: uuid("user_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.theatreId, table.userId] }),
    foreignKey({
      name: "notifications_theatre_members_fk",
      columns: [table.theatreId, table.userId],
      foreignColumns: [theatreMembers.theatreId, theatreMembers.userId],
    }).onDelete("cascade"),
  ],
);

export const nominations = pgTable(
  "nominations",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    theatreId: uuid("theatre_id")
      .notNull()
      .references(() => theatres.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id),
    movieId: integer("movie_id")
      .notNull()
      .references(() => movies.id),
    comment: text("comment"),
    completed: boolean("completed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("nominations_theatre_movie_idx").on(
      table.theatreId,
      table.movieId,
    ),
  ],
);

// Nomination comment
export const nomcoms = pgTable(
  "nomcoms",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    theatreId: uuid("theatre_id")
      .notNull()
      .references(() => theatres.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id),
    nominationId: integer("nomination_id")
      .notNull()
      .references(() => nominations.id, { onDelete: "cascade" }),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("nomcoms_nomination_idx").on(table.nominationId)],
);

/**
 * "This person watched this movie" — a user-level fact that follows them into
 * every theatre, rather than something each theatre records separately.
 */
export const seen = pgTable(
  "seen",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    movieId: integer("movie_id")
      .notNull()
      .references(() => movies.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("seen_user_movie_idx").on(table.userId, table.movieId),
  ],
);

export type FeedbackCategory = "bug" | "feature" | "design" | "copy" | "other";

export const feedback = pgTable("feedback", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id),
  category: text(),
  message: text().notNull(),
  resolved: boolean().notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const feedbackRelations = relations(feedback, ({ one }) => ({
  user: one(authUsers, {
    fields: [feedback.userId],
    references: [authUsers.id],
  }),
}));

export const theatresRelations = relations(theatres, ({ many, one }) => ({
  members: many(theatreMembers),
  nominations: many(nominations),
  owner: one(authUsers, {
    fields: [theatres.createdBy],
    references: [authUsers.id],
  }),
}));

export const theatreMembersRelations = relations(theatreMembers, ({ one }) => ({
  theatre: one(theatres, {
    fields: [theatreMembers.theatreId],
    references: [theatres.id],
  }),
  user: one(authUsers, {
    fields: [theatreMembers.userId],
    references: [authUsers.id],
  }),
}));

export const nominationsRelations = relations(nominations, ({ one, many }) => ({
  theatre: one(theatres, {
    fields: [nominations.theatreId],
    references: [theatres.id],
  }),
  movie: one(movies, {
    fields: [nominations.movieId],
    references: [movies.id],
  }),
  nomcoms: many(nomcoms),
  nominator: one(authUsers, {
    fields: [nominations.userId],
    references: [authUsers.id],
  }),
}));

export const nomcomsRelations = relations(nomcoms, ({ one }) => ({
  nomination: one(nominations, {
    fields: [nomcoms.nominationId],
    references: [nominations.id],
  }),
  commenter: one(authUsers, {
    fields: [nomcoms.userId],
    references: [authUsers.id],
  }),
}));

export const seenRelations = relations(seen, ({ one }) => ({
  by: one(authUsers, { fields: [seen.userId], references: [authUsers.id] }),
  movie: one(movies, { fields: [seen.movieId], references: [movies.id] }),
}));

export type TheatreRole = "admin" | "member";

export type Theatre = typeof theatres.$inferSelect;
export type TheatreMember = Omit<typeof theatreMembers.$inferSelect, "role"> & {
  role: TheatreRole;
};
export type Movie = Exclude<
  typeof movies.$inferSelect,
  "details" | "ratings"
> & {
  details: MovieDetails;
  ratings: MovieRatings;
};
export type RawNomination = typeof nominations.$inferSelect;
export type Nomination = RawNomination & {
  movie: Movie;
  nomcoms: NomCom[];
  nominator: Person;
  /** Members of this nomination's theatre who have marked the movie seen. */
  seenBy: Person[];
};
export type NomCom = typeof nomcoms.$inferSelect & { commenter: Person };
export type Seen = typeof seen.$inferSelect;
export type Feedback = Omit<typeof feedback.$inferSelect, "category"> & {
  category: FeedbackCategory | null;
};

export interface User {
  id: string;
  name: string;
  email: string;
}

export type Person = Pick<User, "id" | "name">;

export interface MovieDetails extends _MovieDetails {
  posterUrl?: string | null;
  description?: string | null;
  year?: number | null;
  justWatch?: JustWatchAvailability;
  boxOffice?: BoxOffice;
}

export interface MDBResponse {
  ratings: MDBRating[];
  ids: {
    imdb?: string;
  };
}

export interface MDBRating {
  source: RatingSource;
  value: number | null;
  url: string | null;
  score: number | null;
  votes: number | null;
}

export type RatingSource =
  | "imdb"
  | "letterboxd"
  | "tomatoes"
  | "popcorn"
  | "metacritic"
  | "rogerebert";

export interface MovieRatings {
  services: MDBRating[];
  raw: object;
}
