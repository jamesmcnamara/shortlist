import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/src/db/test-db";
import { setDbForTesting, type DB } from "@/src/db/client";
import { movies, nominations, theatres, theatreMembers } from "@/src/db/schema";
import { authUsers } from "@/src/db/neon-auth-schema";
import * as theatresRoute from "./route";
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
    .insert(theatres)
    .values({
      name: "Club",
      createdBy: CASEY,
      inviteCode: "invite-club",
      adminInviteCode: "invite-club-admin",
    })
    .returning();

  const [watchlist] = await db
    .insert(theatres)
    .values({
      name: "Watchlist",
      createdBy: CASEY,
      inviteCode: "invite-watchlist",
      adminInviteCode: "invite-watchlist-admin",
    })
    .returning();

  const [otherWatchlist] = await db
    .insert(theatres)
    .values({
      name: "Other Watchlist",
      createdBy: CASEY,
      inviteCode: "invite-other",
      adminInviteCode: "invite-other-admin",
    })
    .returning();

  await db.insert(theatreMembers).values([
    { theatreId: club.id, userId: CASEY, role: "admin" },
    { theatreId: watchlist.id, userId: CASEY, role: "admin" },
    { theatreId: otherWatchlist.id, userId: CASEY, role: "admin" },
  ]);

  const [movie] = await db
    .insert(movies)
    .values({
      tmdbId: 1,
      details: { title: "Test Movie" },
      ratings: { services: [], raw: {} },
    })
    .returning();

  // Already in the watchlist, but not the other watchlist or the club theatre.
  await db.insert(nominations).values({
    theatreId: watchlist.id,
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

describe("GET /api/theatres", () => {
  it.each(["", "?previews=true", "?movieIds=1"])(
    "includes the designated watchlist marker in theatre summaries (%s)",
    async (query) => {
      asUser(CASEY);
      await createWatchlist(CASEY);
      const body = await (await theatresRoute.GET(new Request(`http://test${query}`))).json();
      expect(body).toContainEqual(expect.objectContaining({
        name: "Watchlist", watchlistFor: CASEY, role: "admin",
      }));
      expect(body.filter((theatre: { watchlistFor: string | null }) => theatre.watchlistFor === CASEY))
        .toHaveLength(1);
    },
  );

  it("returns plain summaries without movie data when no movies are asked for", async () => {
    asUser(CASEY);

    const body = await (
      await theatresRoute.GET(new Request("http://test?movieId=1"))
    ).json();

    expect(body).toHaveLength(3);
    expect(
      body.every(
        (theatre: Record<string, unknown>) =>
          Object.keys(theatre).sort().join() === "id,name,role,watchlistFor",
      ),
    ).toBe(true);
  });

  describe("GET /api/theatres?previews=true", () => {
    it("returns the caller's theatre previews without invite codes", async () => {
      asUser(CASEY);
      const otherUserId = "55555555-5555-5555-5555-555555555555";
      await fixture.db.insert(authUsers).values({
        id: otherUserId,
        name: "Other",
        email: "other@example.com",
      });
      await fixture.db.insert(theatres).values({
        name: "Private",
        createdBy: otherUserId,
        watchlistFor: otherUserId,
        inviteCode: "private-invite",
        adminInviteCode: "private-admin-invite",
      });
      const [posterMovie] = await fixture.db.insert(movies).values({
        tmdbId: 2,
        details: { title: "Poster movie", posterUrl: "https://example.com/poster.jpg" },
        ratings: { services: [], raw: {} },
      }).returning();
      await fixture.db.insert(nominations).values({
        theatreId: fixture.club.id,
        userId: CASEY,
        movieId: posterMovie.id,
      });

      const response = await theatresRoute.GET(new Request("http://test?previews=true"));
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
      expect(body).not.toContainEqual(expect.objectContaining({ name: "Private" }));
      expect(JSON.stringify(body)).not.toContain("invite");
      expect(JSON.stringify(body)).not.toContain("private-admin-invite");
      expect(JSON.stringify(body)).not.toContain("other@example.com");
    });

    it("returns no personal theatre choices to signed-out visitors", async () => {
      await createWatchlist(CASEY);
      asUser("");
      const response = await theatresRoute.GET(new Request("http://test?previews=true"));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual([]);
    });
  });
});

describe("GET /api/theatres?movieIds=", () => {
  const get = async (query: string) =>
    theatresRoute.GET(new Request(`http://test?movieIds=${query}`));

  it("lists which of the movies each of the caller's theatres carries", async () => {
    asUser(CASEY);
    const [second] = await fixture.db
      .insert(movies)
      .values({
        tmdbId: 3,
        details: { title: "Second" },
        ratings: { services: [], raw: {} },
      })
      .returning();
    await fixture.db.insert(nominations).values([
      { theatreId: fixture.club.id, userId: CASEY, movieId: second.id },
      { theatreId: fixture.watchlist.id, userId: CASEY, movieId: second.id },
    ]);
    const otherUserId = "55555555-5555-5555-5555-555555555555";
    await fixture.db.insert(authUsers).values({
      id: otherUserId,
      name: "Other",
      email: "other@example.com",
    });
    const [privateTheatre] = await fixture.db
      .insert(theatres)
      .values({
        name: "Private",
        createdBy: otherUserId,
        inviteCode: "private-invite",
        adminInviteCode: "private-admin-invite",
      })
      .returning();
    await fixture.db.insert(nominations).values({
      theatreId: privateTheatre.id,
      userId: otherUserId,
      movieId: fixture.movieId,
    });

    const response = await get(
      `${second.id},${fixture.movieId},${second.id}`,
    );
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(
      Object.fromEntries(
        body.map((theatre: { id: string; movieIds: number[] }) => [
          theatre.id,
          theatre.movieIds,
        ]),
      ),
    ).toEqual({
      [fixture.club.id]: [second.id],
      [fixture.watchlist.id]: [fixture.movieId, second.id].sort((a, b) => a - b),
      [fixture.otherWatchlist.id]: [],
    });
    expect(JSON.stringify(body)).not.toContain("invite");
  });

  it.each([
    "",
    "abc",
    "1,,2",
    "0",
    "-1",
    "1.5",
    "2147483648",
    Array.from({ length: 101 }, (_, index) => index + 1).join(","),
  ])("rejects a bad movie id list (%s)", async (query) => {
    asUser(CASEY);
    const response = await get(query);
    expect(response.status).toBe(400);
  });

  it("requires a signed-in user", async () => {
    asUser("");
    expect((await get(String(fixture.movieId))).status).toBe(401);
  });
});
