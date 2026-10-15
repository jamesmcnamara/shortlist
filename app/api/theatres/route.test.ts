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

describe("GET /api/theatres?movieId=", () => {
  it.each(["", "?previews=true", "?movieId=1"])(
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

  it("reports hasMovie per theatre without it when the param is absent", async () => {
    const { GET } = theatresRoute;
    asUser(CASEY);

    const body = await (await GET(new Request("http://test"))).json();

    expect(body).toHaveLength(3);
    expect(
      body.every((theatre: Record<string, unknown>) => "hasMovie" in theatre),
    ).toBe(false);
  });

  describe("GET /api/theatres?previews=true", () => {
    it("returns poster previews without invite codes or non-member theatres", async () => {
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
      expect(JSON.stringify(body)).not.toContain("invite");
      expect(JSON.stringify(body)).not.toContain("Private");
    });

    it("requires a signed-in user", async () => {
      asUser("");
      const response = await theatresRoute.GET(new Request("http://test?previews=true"));
      expect(response.status).toBe(401);
    });
  });

  it("marks only the theatre that already nominated the movie", async () => {
    const { GET } = theatresRoute;
    asUser(CASEY);

    const body = await (
      await GET(new Request(`http://test?movieId=${fixture.movieId}`))
    ).json();

    const hasMovieByTheatreId = Object.fromEntries(
      body.map((theatre: { id: string; hasMovie: boolean }) => [
        theatre.id,
        theatre.hasMovie,
      ]),
    );
    expect(hasMovieByTheatreId).toEqual({
      [fixture.club.id]: false,
      [fixture.watchlist.id]: true,
      [fixture.otherWatchlist.id]: false,
    });
  });
});
