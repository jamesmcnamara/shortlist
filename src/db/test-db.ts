import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
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

    create table rooms (
      id uuid primary key default gen_random_uuid(),
      slug text not null unique,
      name text not null,
      created_by uuid not null references neon_auth."user"(id),
      invite_code text not null unique,
      nominations_per_cycle integer,
      votes_per_cycle integer not null default 5,
      cycle_length text not null default 'month',
      allow_self_vote boolean not null default false,
      allow_duplicate_nominations boolean not null default false,
      created_at timestamptz not null default now()
    );

    create table room_members (
      room_id uuid not null references rooms(id) on delete cascade,
      user_id uuid not null references neon_auth."user"(id),
      role text not null default 'member',
      joined_at timestamptz not null default now(),
      primary key (room_id, user_id)
    );

    create table movies (
      id integer primary key generated always as identity,
      tmdb_id integer unique,
      title text not null,
      poster_url text,
      description text,
      year integer,
      runtime integer,
      tmdb_rating real,
      imdb_rating real,
      imdb_url text,
      letterboxd_rating real,
      letterboxd_url text,
      rotten_tomatoes_rating real,
      rotten_tomatoes_url text,
      rotten_tomatoes_audience_rating real,
      rotten_tomatoes_audience_url text,
      created_at timestamptz not null default now()
    );

    create table nominations (
      id integer primary key generated always as identity,
      room_id uuid not null references rooms(id) on delete cascade,
      user_id uuid not null references neon_auth."user"(id),
      movie_id integer not null references movies(id),
      comment text,
      cycle integer not null,
      created_at timestamptz not null default now()
    );

    create table votes (
      id integer primary key generated always as identity,
      room_id uuid not null references rooms(id) on delete cascade,
      user_id uuid not null references neon_auth."user"(id),
      nomination_id integer not null references nominations(id) on delete cascade,
      comment text,
      cycle integer not null,
      created_at timestamptz not null default now()
    );

    create table nomcoms (
      id integer primary key generated always as identity,
      room_id uuid not null references rooms(id) on delete cascade,
      user_id uuid not null references neon_auth."user"(id),
      nomination_id integer not null references nominations(id) on delete cascade,
      comment text,
      created_at timestamptz not null default now()
    );

    create table seen (
      id integer primary key generated always as identity,
      room_id uuid not null references rooms(id) on delete cascade,
      movie_id integer not null references movies(id),
      marked_by uuid not null references neon_auth."user"(id),
      created_at timestamptz not null default now()
    );

    create unique index seen_room_movie_idx on seen (room_id, movie_id);
  `);

  return { db, client };
}
