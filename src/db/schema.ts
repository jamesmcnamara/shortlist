import {
  boolean,
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
import { relations } from "drizzle-orm";
import { authUsers } from "./neon-auth-schema";
import type { MovieDetails as _MovieDetails } from "@lorenzopant/tmdb";

/**
 * A room is the generic container for a group's content. "Movie club" and
 * "watch list" are not distinct types; they are presets over these knobs.
 */
export const rooms = pgTable("rooms", {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => authUsers.id),
  inviteCode: text("invite_code").notNull().unique(),
  // A separate link that grants the "admin" role on join instead of "member".
  adminInviteCode: text("admin_invite_code").notNull().unique(),
  // null means unlimited
  nominationsPerCycle: integer("nominations_per_cycle"),
  votesPerCycle: integer("votes_per_cycle").notNull().default(5),
  cycleLength: text("cycle_length").notNull().default("month"),
  allowSelfVote: boolean("allow_self_vote").notNull().default(false),
  description: text(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const roomMembers = pgTable(
  "room_members",
  {
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id),
    role: text().notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.roomId, table.userId] }),
    index("room_members_user_idx").on(table.userId),
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

export const nominations = pgTable(
  "nominations",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id),
    movieId: integer("movie_id")
      .notNull()
      .references(() => movies.id),
    comment: text("comment"),
    cycle: integer().notNull(),
    completed: boolean("completed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("nominations_room_cycle_idx").on(table.roomId, table.cycle),
    uniqueIndex("nominations_room_movie_idx").on(table.roomId, table.movieId),
  ],
);

export const votes = pgTable(
  "votes",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id),
    nominationId: integer("nomination_id")
      .notNull()
      .references(() => nominations.id, { onDelete: "cascade" }),
    comment: text("comment"),
    cycle: integer().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Stacking multiple votes on one nomination is intended, so there is
    // deliberately no unique constraint. This index serves budget counting.
    index("votes_room_user_cycle_idx").on(
      table.roomId,
      table.userId,
      table.cycle,
    ),
    index("votes_nomination_idx").on(table.nominationId),
  ],
);

// Nomination comment
export const nomcoms = pgTable(
  "nomcoms",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
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
 * every room, rather than something each room records separately.
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

export const roomsRelations = relations(rooms, ({ many, one }) => ({
  members: many(roomMembers),
  nominations: many(nominations),
  owner: one(authUsers, {
    fields: [rooms.createdBy],
    references: [authUsers.id],
  }),
}));

export const roomMembersRelations = relations(roomMembers, ({ one }) => ({
  room: one(rooms, { fields: [roomMembers.roomId], references: [rooms.id] }),
  user: one(authUsers, {
    fields: [roomMembers.userId],
    references: [authUsers.id],
  }),
}));

export const nominationsRelations = relations(nominations, ({ one, many }) => ({
  room: one(rooms, { fields: [nominations.roomId], references: [rooms.id] }),
  movie: one(movies, {
    fields: [nominations.movieId],
    references: [movies.id],
  }),
  votes: many(votes),
  nomcoms: many(nomcoms),
  nominator: one(authUsers, {
    fields: [nominations.userId],
    references: [authUsers.id],
  }),
}));

export const votesRelations = relations(votes, ({ one }) => ({
  nomination: one(nominations, {
    fields: [votes.nominationId],
    references: [nominations.id],
  }),
  voter: one(authUsers, { fields: [votes.userId], references: [authUsers.id] }),
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

export type CycleLength = "month" | "week" | "never";
export type RoomRole = "admin" | "member";

export type Room = Omit<typeof rooms.$inferSelect, "cycleLength"> & {
  cycleLength: CycleLength;
};
export type RoomMember = Omit<typeof roomMembers.$inferSelect, "role"> & {
  role: RoomRole;
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
  votes: Vote[];
  nomcoms: NomCom[];
  nominator: User;
  /** Members of this nomination's room who have marked the movie seen. */
  seenBy: User[];
};
export type Vote = typeof votes.$inferSelect & { voter: User };
export type NomCom = typeof nomcoms.$inferSelect & { commenter: User };
export type Seen = typeof seen.$inferSelect;
export type Feedback = Omit<typeof feedback.$inferSelect, "category"> & {
  category: FeedbackCategory | null;
};

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface MovieDetails extends _MovieDetails {
  posterUrl?: string;
  description?: string;
  year?: number;
}
// interface MovieDetails {
//   title: string;
//   posterUrl?: string;
//   description?: string;
//   year?: number;
//   runtime?: number;
//   tmdbRating?: number;
// }

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
  "imdb" | "letterboxd" | "tomatoes" | "popcorn" | "metacritic" | "rogerebert";

export interface MovieRatings {
  services: MDBRating[];
  raw: object;
}
