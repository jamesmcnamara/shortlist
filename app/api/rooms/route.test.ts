import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/src/db/test-db";
import { setDbForTesting, type DB } from "@/src/db/client";
import { movies, nominations, rooms, roomMembers } from "@/src/db/schema";
import { authUsers } from "@/src/db/neon-auth-schema";
import * as roomsRoute from "./route";

// Auth is the one thing stubbed; everything below it runs for real.
const currentUserId = vi.hoisted(() => ({ value: "" }));
vi.mock("@/lib/auth/server", () => ({
  auth: {
    getSession: async () => ({
      data: currentUserId.value ? { user: { id: currentUserId.value } } : null,
    }),
  },
}));

const CASEY = "44444444-4444-4444-4444-444444444444";
const asUser = (id: string) => {
  currentUserId.value = id;
};

interface Fixture {
  db: DB;
  club: { id: string; slug: string };
  watchlist: { id: string; slug: string };
  otherWatchlist: { id: string; slug: string };
  movieId: number;
}

let fixture: Fixture;

beforeEach(async () => {
  const { db } = await createTestDb();
  setDbForTesting(() => db as unknown as DB);

  await db
    .insert(authUsers)
    .values([{ id: CASEY, name: "Casey", email: "casey@example.com" }]);

  const [club] = await db
    .insert(rooms)
    .values({
      slug: "club",
      name: "Club",
      createdBy: CASEY,
      inviteCode: "invite-club",
      adminInviteCode: "invite-club-admin",
      type: "club",
      nominationsPerCycle: 1,
      votesPerCycle: 2,
      cycleLength: "month",
    })
    .returning();

  const [watchlist] = await db
    .insert(rooms)
    .values({
      slug: "watchlist",
      name: "Watchlist",
      createdBy: CASEY,
      inviteCode: "invite-watchlist",
      adminInviteCode: "invite-watchlist-admin",
      type: "watchlist",
      nominationsPerCycle: null,
      votesPerCycle: 5,
      cycleLength: "never",
    })
    .returning();

  const [otherWatchlist] = await db
    .insert(rooms)
    .values({
      slug: "other-watchlist",
      name: "Other Watchlist",
      createdBy: CASEY,
      inviteCode: "invite-other",
      adminInviteCode: "invite-other-admin",
      type: "watchlist",
      nominationsPerCycle: null,
      votesPerCycle: 5,
      cycleLength: "never",
    })
    .returning();

  await db.insert(roomMembers).values([
    { roomId: club.id, userId: CASEY, role: "admin" },
    { roomId: watchlist.id, userId: CASEY, role: "admin" },
    { roomId: otherWatchlist.id, userId: CASEY, role: "admin" },
  ]);

  const [movie] = await db
    .insert(movies)
    .values({
      tmdbId: 1,
      details: { title: "Test Movie" },
      ratings: { services: [], raw: {} },
    })
    .returning();

  // Already nominated into the watchlist, but not the other watchlist or the
  // club room.
  await db.insert(nominations).values({
    roomId: watchlist.id,
    userId: CASEY,
    movieId: movie.id,
    cycle: 0,
  });

  fixture = {
    db: db as unknown as DB,
    club,
    watchlist,
    otherWatchlist,
    movieId: movie.id,
  };
});

describe("GET /api/rooms?movieId=", () => {
  it("reports hasMovie per room without it when the param is absent", async () => {
    const { GET } = roomsRoute;
    asUser(CASEY);

    const body = await (await GET(new Request("http://test"))).json();

    expect(body).toHaveLength(3);
    expect(body.every((room: Record<string, unknown>) => "hasMovie" in room)).toBe(
      false,
    );
  });

  it("marks only the room that already nominated the movie", async () => {
    const { GET } = roomsRoute;
    asUser(CASEY);

    const body = await (
      await GET(new Request(`http://test?movieId=${fixture.movieId}`))
    ).json();

    const bySlug = Object.fromEntries(
      body.map((room: { slug: string; hasMovie: boolean }) => [
        room.slug,
        room.hasMovie,
      ]),
    );
    expect(bySlug).toEqual({
      club: false,
      watchlist: true,
      "other-watchlist": false,
    });
  });

  it("still returns the room's type so club rooms can be excluded as add targets", async () => {
    const { GET } = roomsRoute;
    asUser(CASEY);

    const body = await (
      await GET(new Request(`http://test?movieId=${fixture.movieId}`))
    ).json();

    const types = Object.fromEntries(
      body.map((room: { slug: string; type: string }) => [
        room.slug,
        room.type,
      ]),
    );
    expect(types).toEqual({
      club: "club",
      watchlist: "watchlist",
      "other-watchlist": "watchlist",
    });
  });
});
