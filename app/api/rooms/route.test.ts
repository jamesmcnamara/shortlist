import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/src/db/test-db";
import { setDbForTesting, type DB } from "@/src/db/client";
import { movies, nominations, rooms, roomMembers } from "@/src/db/schema";
import { authUsers } from "@/src/db/neon-auth-schema";
import * as roomsRoute from "./route";
import { createWatchlist } from "@/lib/auth/create-watchlist";

// Auth is the one thing stubbed; everything below it runs for real.
const currentUserId = vi.hoisted(() => ({ value: "" }));
vi.mock("@/lib/auth/server", () => ({
  getSession: async () =>
    currentUserId.value ? { user: { id: currentUserId.value } } : null,
}));

const CASEY = "44444444-4444-4444-4444-444444444444";
const asUser = (id: string) => {
  currentUserId.value = id;
};

interface Fixture {
  db: DB;
  club: { id: string };
  watchlist: { id: string };
  otherWatchlist: { id: string };
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
      name: "Club",
      createdBy: CASEY,
      inviteCode: "invite-club",
      adminInviteCode: "invite-club-admin",
    })
    .returning();

  const [watchlist] = await db
    .insert(rooms)
    .values({
      name: "Watchlist",
      createdBy: CASEY,
      inviteCode: "invite-watchlist",
      adminInviteCode: "invite-watchlist-admin",
    })
    .returning();

  const [otherWatchlist] = await db
    .insert(rooms)
    .values({
      name: "Other Watchlist",
      createdBy: CASEY,
      inviteCode: "invite-other",
      adminInviteCode: "invite-other-admin",
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

  // Already in the watchlist, but not the other watchlist or the club room.
  await db.insert(nominations).values({
    roomId: watchlist.id,
    userId: CASEY,
    movieId: movie.id,
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
  it.each(["", "?previews=true", "?movieId=1"])(
    "includes the designated watchlist marker in room summaries (%s)",
    async (query) => {
      asUser(CASEY);
      await createWatchlist(CASEY);
      const body = await (await roomsRoute.GET(new Request(`http://test${query}`))).json();
      expect(body).toContainEqual(expect.objectContaining({
        name: "Watchlist", watchlistFor: CASEY, role: "admin",
      }));
      expect(body.filter((room: { watchlistFor: string | null }) => room.watchlistFor === CASEY))
        .toHaveLength(1);
    },
  );

  it("reports hasMovie per room without it when the param is absent", async () => {
    const { GET } = roomsRoute;
    asUser(CASEY);

    const body = await (await GET(new Request("http://test"))).json();

    expect(body).toHaveLength(3);
    expect(
      body.every((room: Record<string, unknown>) => "hasMovie" in room),
    ).toBe(false);
  });

  describe("GET /api/rooms?previews=true", () => {
    it("returns poster previews without invite codes or non-member rooms", async () => {
      asUser(CASEY);
      const otherUserId = "55555555-5555-5555-5555-555555555555";
      await fixture.db.insert(authUsers).values({
        id: otherUserId,
        name: "Other",
        email: "other@example.com",
      });
      await fixture.db.insert(rooms).values({
        name: "Private",
        createdBy: otherUserId,
        inviteCode: "private-invite",
        adminInviteCode: "private-admin-invite",
      });
      const [posterMovie] = await fixture.db.insert(movies).values({
        tmdbId: 2,
        details: { title: "Poster movie", posterUrl: "https://example.com/poster.jpg" },
        ratings: { services: [], raw: {} },
      }).returning();
      await fixture.db.insert(nominations).values({
        roomId: fixture.club.id,
        userId: CASEY,
        movieId: posterMovie.id,
      });

      const response = await roomsRoute.GET(new Request("http://test?previews=true"));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveLength(3);
      expect(body).toContainEqual(expect.objectContaining({
        id: fixture.club.id,
        posterUrls: ["https://example.com/poster.jpg"],
      }));
      expect(body).toContainEqual(expect.objectContaining({
        id: fixture.otherWatchlist.id,
        posterUrls: [],
      }));
      expect(JSON.stringify(body)).not.toContain("invite");
      expect(JSON.stringify(body)).not.toContain("Private");
    });

    it("requires a signed-in user", async () => {
      asUser("");
      const response = await roomsRoute.GET(new Request("http://test?previews=true"));
      expect(response.status).toBe(401);
    });
  });

  it("marks only the room that already nominated the movie", async () => {
    const { GET } = roomsRoute;
    asUser(CASEY);

    const body = await (
      await GET(new Request(`http://test?movieId=${fixture.movieId}`))
    ).json();

    const hasMovieByRoomId = Object.fromEntries(
      body.map((room: { id: string; hasMovie: boolean }) => [
        room.id,
        room.hasMovie,
      ]),
    );
    expect(hasMovieByRoomId).toEqual({
      [fixture.club.id]: false,
      [fixture.watchlist.id]: true,
      [fixture.otherWatchlist.id]: false,
    });
  });
});
