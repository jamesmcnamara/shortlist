import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "@/src/db/test-db";
import { setDbForTesting, type DB } from "@/src/db/client";
import { authUsers } from "@/src/db/neon-auth-schema";
import {
  movies,
  nominations,
  theatreMembers,
  theatres,
  type Movie,
} from "@/src/db/schema";
import type { BoxOffice } from "@/app/lib/box-office";
import { setMovieProviderForTesting } from "@/app/lib/movie-metadata";
import { POST as add } from "./theatres/[theatreId]/nominations/route";
import { POST as importMovie } from "./theatres/[theatreId]/nominations/import/route";
import { POST as refresh } from "./theatres/[theatreId]/box-office/route";

const auth = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth/server", () => ({
  getSession: async () => (auth.userId ? { user: { id: auth.userId } } : null),
}));

const html = readFileSync(
  new URL("../lib/fixtures/box-office.html", import.meta.url),
  "utf8",
);
const USER = "11111111-1111-1111-1111-111111111111";
const THEATRE = "22222222-2222-2222-2222-222222222222";
const OTHER = "33333333-3333-3333-3333-333333333333";
const context = (theatreId = THEATRE) => ({
  params: Promise.resolve({ theatreId }),
});
const request = (body: unknown) =>
  new Request("http://test/nominations", {
    method: "POST",
    body: JSON.stringify(body),
  });
const page = () =>
  new Response(html, { headers: { "Content-Type": "text/html" } });

let db: TestDb;
let close: () => Promise<void>;
let movie: Movie;
const fetch = vi.fn<typeof globalThis.fetch>();

beforeEach(async () => {
  const created = await createTestDb();
  db = created.db;
  close = () => created.client.close();
  setDbForTesting(() => db as unknown as DB);
  auth.userId = USER;
  fetch.mockReset().mockImplementation(async () => page());
  vi.stubGlobal("fetch", fetch);
  await db.insert(authUsers).values({
    id: USER,
    name: "User",
    email: "user@example.com",
  });
  await db.insert(theatres).values([THEATRE, OTHER].map((id) => ({
    id,
    name: "List",
    createdBy: USER,
    inviteCode: id,
    adminInviteCode: `admin-${id}`,
  })));
  await db.insert(theatreMembers).values({ theatreId: THEATRE, userId: USER });
  const [stored] = await db.insert(movies).values({
    tmdbId: 157336,
    details: {
      title: "Interstellar",
      imdb_id: "tt0816692",
      budget: 1,
      revenue: 2,
      year: 2014,
      justWatch: { status: "matched", offers: [] },
    },
    ratings: { services: [], raw: {} },
  }).returning();
  movie = stored as Movie;
  setMovieProviderForTesting({
    hasCredentials: () => true,
    bestMatch: vi.fn().mockResolvedValue(movie),
    search: vi.fn(),
    get: vi.fn(),
  });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await close();
});

const storedDetails = async () => {
  const [row] = await db.select().from(movies).where(eq(movies.id, movie.id));
  return row.details;
};

describe("TMDB budget fallback", () => {
  it.each(["normal", "import", "refresh"])(
    "fills a missing Mojo budget during %s enrichment",
    async (mode) => {
      fetch.mockImplementation(async () => new Response(
        html.replace("$165,000,000", "-"),
        { headers: { "Content-Type": "text/html" } },
      ));
      if (mode === "refresh") {
        await db.insert(nominations).values({
          theatreId: THEATRE, userId: USER, movieId: movie.id,
        });
      }
      const response = mode === "normal"
        ? await add(request({ movieId: movie.id }), context())
        : mode === "import"
          ? await importMovie(request({ title: "Interstellar" }), context())
          : await refresh(request({ movieId: movie.id }), context());
      expect(response.ok).toBe(true);
      if (mode === "refresh") {
        expect(await response.json()).toMatchObject({ budget: 1 });
      }
      expect(await storedDetails()).toMatchObject({
        budget: 1,
        revenue: 2,
        boxOffice: { budget: 1, worldwideGross: 782_948_164 },
      });
    },
  );

  it.each([undefined, null, 0, -1, 1.5, "100", Number.MAX_SAFE_INTEGER + 1])(
    "leaves a missing Mojo budget unknown for invalid TMDB budget %s",
    async (budget) => {
      await db.update(movies).set({
        details: { ...movie.details, budget },
      }).where(eq(movies.id, movie.id));
      fetch.mockImplementation(async () => new Response(
        html.replace("$165,000,000", "-"),
        { headers: { "Content-Type": "text/html" } },
      ));
      expect((await add(request({ movieId: movie.id }), context())).status).toBe(201);
      expect(await storedDetails()).toHaveProperty("boxOffice.budget", null);
    },
  );

  it("preserves an explicit zero Mojo budget instead of using TMDB", async () => {
    fetch.mockImplementation(async () => new Response(
      html.replace("$165,000,000", "$0"),
      { headers: { "Content-Type": "text/html" } },
    ));
    expect((await add(request({ movieId: movie.id }), context())).status).toBe(201);
    expect(await storedDetails()).toHaveProperty("boxOffice.budget", 0);
  });
});

describe("nomination box office enrichment", () => {
  it("saves Mojo figures before returning the nomination, leaving TMDB and streaming data alone", async () => {
    const response = await add(request({ movieId: movie.id }), context());
    expect(response.status).toBe(201);
    const nomination = await response.json();
    expect(nomination.movie.details).toMatchObject({
      budget: 1,
      revenue: 2,
      justWatch: { status: "matched", offers: [] },
      boxOffice: {
        source: "boxofficemojo",
        currency: "USD",
        budget: 165_000_000,
        domesticGross: 203_227_580,
        internationalGross: 579_720_584,
        worldwideGross: 782_948_164,
      },
    });

    expect(await storedDetails()).toEqual(nomination.movie.details);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("theatre-scoped box office refresh", () => {
  beforeEach(async () => {
    await db.insert(nominations).values({
      theatreId: THEATRE, userId: USER, movieId: movie.id, completed: true,
    });
  });

  it("refreshes a member's watched movie without changing nominations or other metadata", async () => {
    const before = await db.select().from(nominations);
    const response = await refresh(request({ movieId: movie.id }), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      budget: 165_000_000, worldwideGross: 782_948_164,
    });
    expect(await storedDetails()).toMatchObject({
      budget: 1, revenue: 2, justWatch: { status: "matched" },
      boxOffice: { worldwideGross: 782_948_164 },
    });
    expect(await db.select().from(nominations)).toEqual(before);
  });

  it.each(["", "44444444-4444-4444-4444-444444444444"])(
    "rejects an unauthorized user before scraping (%s)",
    async (userId) => {
      auth.userId = userId;
      expect((await refresh(request({ movieId: movie.id }), context())).status)
        .toBe(userId ? 404 : 401);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("rejects movies not on the authorized theatre", async () => {
    await db.delete(nominations).where(eq(nominations.theatreId, THEATRE));
    await db.insert(nominations).values({
      theatreId: OTHER, userId: USER, movieId: movie.id,
    });
    expect((await refresh(request({ movieId: movie.id }), context())).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([null, {}, { movieId: "1" }, { movieId: 0 }, { movieId: -1 }, { movieId: 1.5 }])(
    "rejects invalid input %j", async (body) => {
      expect((await refresh(request(body), context())).status).toBe(400);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("reports a missing IMDb ID rather than returning a successful refresh", async () => {
    await db.update(movies).set({ details: { title: "Unknown" } }).where(eq(movies.id, movie.id));
    expect((await refresh(request({ movieId: movie.id }), context())).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports a failed lookup and preserves saved figures", async () => {
    await refresh(request({ movieId: movie.id }), context());
    const before = await storedDetails();
    fetch.mockRejectedValue(new Error("Mojo unavailable"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await refresh(request({ movieId: movie.id }), context());
    expect(response.status).toBe(502);
    expect(await response.json()).toHaveProperty("error");
    expect(await storedDetails()).toEqual(before);
    expect(log).toHaveBeenCalled();
  });

  it("does not save data after the movie is removed from the list during lookup", async () => {
    fetch.mockImplementation(async () => {
      await db.delete(nominations).where(eq(nominations.theatreId, THEATRE));
      return page();
    });
    expect((await refresh(request({ movieId: movie.id }), context())).status).toBe(404);
    expect(await storedDetails()).not.toHaveProperty("boxOffice");
  });
});

describe("nomination box office enrichment failures and imports", () => {
  it("scrapes successful imports but not duplicate imports", async () => {
    const added = await importMovie(request({ title: "Interstellar" }), context());
    expect((await added.json()).status).toBe("added");
    expect(await storedDetails()).toHaveProperty("boxOffice.worldwideGross", 782_948_164);
    const duplicate = await importMovie(request({ title: "Interstellar" }), context());
    expect((await duplicate.json()).status).toBe("already_on_list");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["normal", "import"])("keeps the %s nomination on a lookup failure", async (mode) => {
    fetch.mockRejectedValue(new DOMException("Timed out", "TimeoutError"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = mode === "normal"
      ? await add(request({ movieId: movie.id }), context())
      : await importMovie(request({ title: "Interstellar" }), context());
    expect(response.status).toBe(mode === "normal" ? 201 : 200);
    expect(await db.select().from(nominations)).toHaveLength(1);
    expect(await storedDetails()).not.toHaveProperty("boxOffice");
    expect(log).toHaveBeenCalledWith(
      `Unable to load Box Office Mojo for movie ${movie.id}.`,
      expect.any(Error),
    );
  });

  it.each([403, 404, 429])("preserves existing figures on HTTP %s", async (status) => {
    const previous = {
      source: "boxofficemojo",
      currency: "USD",
      url: "https://www.boxofficemojo.com/title/tt0816692/",
      fetchedAt: "2026-01-01T00:00:00.000Z",
      budget: null,
      domesticGross: 100,
      internationalGross: 200,
      worldwideGross: 300,
    } satisfies BoxOffice;
    await db.update(movies).set({
      details: { ...movie.details, boxOffice: previous },
    }).where(eq(movies.id, movie.id));
    fetch.mockResolvedValue(new Response("", { status }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await add(request({ movieId: movie.id }), context())).status).toBe(201);
    expect(await storedDetails()).toHaveProperty("boxOffice", previous);
  });

  it("does not save a successful-looking blocked page", async () => {
    fetch.mockImplementation(async () => new Response("<h1>Access denied</h1>", {
      headers: { "Content-Type": "text/html" },
    }));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await add(request({ movieId: movie.id }), context())).status).toBe(201);
    expect(await storedDetails()).not.toHaveProperty("boxOffice");
    expect(log).toHaveBeenCalled();
  });

  it("keeps the nomination when saving the fetched figures fails", async () => {
    await db.execute(sql`
      alter table movies add constraint reject_box_office
      check (not (details ? 'boxOffice'))
    `);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await add(request({ movieId: movie.id }), context())).status).toBe(201);
    expect(await db.select().from(nominations)).toHaveLength(1);
    expect(await storedDetails()).not.toHaveProperty("boxOffice");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalled();
  });

  it("does not scrape when inserting the nomination fails", async () => {
    await db.insert(nominations).values({
      theatreId: THEATRE,
      userId: USER,
      movieId: movie.id,
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await add(request({ movieId: movie.id }), context())).status).toBe(500);
    expect(fetch).not.toHaveBeenCalled();
    expect(await db.select().from(nominations)).toHaveLength(1);
  });

  it("refreshes a movie already cached through another theatre", async () => {
    await add(request({ movieId: movie.id }), context());
    await db.insert(theatreMembers).values({ theatreId: OTHER, userId: USER });
    fetch.mockImplementation(async () => new Response(
      html.replace("$782,948,164", "$783,000,000"),
      { headers: { "Content-Type": "text/html" } },
    ));
    const response = await add(request({ movieId: movie.id }), context(OTHER));
    expect(response.status).toBe(201);
    expect(await storedDetails()).toHaveProperty("boxOffice.worldwideGross", 783_000_000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("uses MDBList's IMDb id when the cached TMDB details have none", async () => {
    await db.update(movies).set({
      details: { title: "Interstellar" },
      ratings: { services: [], raw: { ids: { imdb: "tt0816692" } } },
    }).where(eq(movies.id, movie.id));
    expect((await add(request({ movieId: movie.id }), context())).status).toBe(201);
    expect(fetch).toHaveBeenCalledWith(
      "https://www.boxofficemojo.com/title/tt0816692/",
      expect.any(Object),
    );
  });

  it("logs and skips missing or invalid IMDb IDs without guessing from the title", async () => {
    await db.update(movies).set({
      details: { title: "Interstellar", imdb_id: "https://example.com" },
    }).where(eq(movies.id, movie.id));
    const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect((await add(request({ movieId: movie.id }), context())).status).toBe(201);
    expect(fetch).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
  });

  it.each(["normal", "import"])("rejects unauthorized %s additions before scraping", async (mode) => {
    const response = mode === "normal"
      ? await add(request({ movieId: movie.id }), context(OTHER))
      : await importMovie(request({ title: "Interstellar" }), context(OTHER));
    expect(response.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
    expect(await db.select().from(nominations)).toHaveLength(0);
  });

  it("does not lose metadata changed while the lookup is running", async () => {
    fetch.mockImplementation(async () => {
      await db.update(movies).set({
        details: { ...movie.details, description: "Changed during the request" },
      }).where(eq(movies.id, movie.id));
      return page();
    });
    expect((await add(request({ movieId: movie.id }), context())).status).toBe(201);
    expect(await storedDetails()).toMatchObject({
      description: "Changed during the request",
      boxOffice: { worldwideGross: 782_948_164 },
    });
  });
});
