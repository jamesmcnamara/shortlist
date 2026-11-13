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
  type MovieDetails,
} from "@/src/db/schema";
import type { BoxOfficeData } from "@/app/lib/box-office";
import {
  findMovieById,
  setMovieProviderForTesting,
} from "@/app/lib/movie-metadata";
import { POST as add } from "./theatres/[theatreId]/nominations/route";
import { POST as importMovie } from "./theatres/[theatreId]/nominations/import/route";
import {
  PATCH as saveBudget,
  POST as refresh,
} from "./theatres/[theatreId]/box-office/route";
import { buildStandings } from "@/app/lib/fantasy";
import { nomination } from "@/app/lib/fantasy-fixtures";
import { serializeMovie } from "@/app/lib/movie";
import { GET as list } from "./theatres/[theatreId]/nominations/route";

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
  vi.stubEnv("CRAWLORA_API_KEY", "test");
  fetch.mockReset().mockImplementation(async () => page());
  vi.stubGlobal(
    "fetch",
    async (
      input: Parameters<typeof globalThis.fetch>[0],
      init?: RequestInit,
    ) =>
      String(input).startsWith("https://api.crawlora.net/")
        ? Response.json({
            code: 200,
            data: { id: "tt0816692", type: "trivia", facts: [], total: 0 },
          })
        : fetch(input, init),
  );
  await db.insert(authUsers).values({
    id: USER,
    name: "User",
    email: "user@example.com",
  });
  await db.insert(theatres).values(
    [THEATRE, OTHER].map((id) => ({
      id,
      name: "List",
      createdBy: USER,
      inviteCode: id,
      adminInviteCode: `admin-${id}`,
    })),
  );
  await db.insert(theatreMembers).values({
    theatreId: THEATRE,
    userId: USER,
    role: "admin",
  });
  const [stored] = await db
    .insert(movies)
    .values({
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
    })
    .returning();
  movie = serializeMovie(stored);
  setMovieProviderForTesting({
    hasCredentials: () => true,
    bestMatch: vi.fn().mockResolvedValue(movie),
    search: vi.fn(),
    get: vi.fn(),
  });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await close();
});

const storedDetails = async () => {
  const [row] = await db.select().from(movies).where(eq(movies.id, movie.id));
  return serializeMovie(row).details;
};

describe("TMDB budget fallback", () => {
  it.each(["normal", "import", "refresh"])(
    "fills a missing Mojo budget during %s enrichment",
    async (mode) => {
      fetch.mockImplementation(
        async () =>
          new Response(html.replace("$165,000,000", "-"), {
            headers: { "Content-Type": "text/html" },
          }),
      );
      if (mode === "refresh") {
        await db.insert(nominations).values({
          theatreId: THEATRE,
          userId: USER,
          movieId: movie.id,
        });
      }
      const response =
        mode === "normal"
          ? await add(request({ movieId: movie.id }), context())
          : mode === "import"
            ? await importMovie(request({ title: "Interstellar" }), context())
            : await refresh(request({ movieId: movie.id }), context());
      expect(response.ok).toBe(true);
      if (mode === "refresh") {
        expect(await response.json()).toMatchObject({
          budget: 1,
          budgetSource: "tmdb",
        });
      }
      expect(await storedDetails()).toMatchObject({
        budget: 1,
        revenue: 2,
        boxOffice: {
          budget: 1,
          budgetSource: "tmdb",
          worldwideGross: 782_948_164,
        },
      });
    },
  );

  it.each([undefined, null, 0, -1, 1.5, "100", Number.MAX_SAFE_INTEGER + 1])(
    "leaves a missing Mojo budget unknown for invalid TMDB budget %s",
    async (budget) => {
      await db
        .update(movies)
        .set({
          details: { ...movie.details, budget },
        })
        .where(eq(movies.id, movie.id));
      fetch.mockImplementation(
        async () =>
          new Response(html.replace("$165,000,000", "-"), {
            headers: { "Content-Type": "text/html" },
          }),
      );
      expect(
        (await add(request({ movieId: movie.id }), context())).status,
      ).toBe(201);
      expect(await storedDetails()).toHaveProperty("boxOffice.budget", null);
      expect(await storedDetails()).not.toHaveProperty(
        "boxOffice.budgetSource",
      );
    },
  );

  it("preserves an explicit zero Mojo budget instead of using TMDB", async () => {
    fetch.mockImplementation(
      async () =>
        new Response(html.replace("$165,000,000", "$0"), {
          headers: { "Content-Type": "text/html" },
        }),
    );
    expect((await add(request({ movieId: movie.id }), context())).status).toBe(
      201,
    );
    expect(await storedDetails()).toHaveProperty("boxOffice.budget", 0);
    expect(await storedDetails()).toHaveProperty(
      "boxOffice.budgetSource",
      "boxofficemojo",
    );
  });
});

describe("Wikipedia budget fallback", () => {
  const ARTICLE = "https://en.wikipedia.org/wiki/Interstellar_(film)";
  const lead = (row: string) =>
    Response.json({
      parse: { text: `<table class="infobox"><tr>${row}</tr></table>` },
    });
  const budgetLead = (cell: string) => lead(`<th>Budget</th><td>${cell}</td>`);
  const mojoWith = (budget: string) => () =>
    new Response(html.replace("$165,000,000", budget), {
      headers: { "Content-Type": "text/html" },
    });
  const serve = (
    wikipedia: () => Response | Promise<Response>,
    mojo = mojoWith("-"),
  ) =>
    fetch.mockImplementation(async (url) =>
      String(url).startsWith("https://en.wikipedia.org/")
        ? wikipedia()
        : mojo(),
    );
  const wikipediaRequests = () =>
    fetch.mock.calls.filter(([url]) =>
      String(url).startsWith("https://en.wikipedia.org/"),
    );
  const setDetails = async (details: object) =>
    db
      .update(movies)
      .set({ details: { ...(await storedDetails()), ...details } })
      .where(eq(movies.id, movie.id));
  const earlier = async (changes: Partial<BoxOfficeData>) => {
    const figures: BoxOfficeData = {
      source: "boxofficemojo",
      url: "https://www.boxofficemojo.com/title/tt0816692/",
      fetchedAt: "2026-01-01T00:00:00.000Z",
      currency: "USD",
      budget: null,
      domesticGross: 1,
      internationalGross: 2,
      worldwideGross: 3,
      ...changes,
    };
    await db
      .update(movies)
      .set({
        boxOffice: {
          boxofficemojo: {
            ...figures,
            source: "boxofficemojo",
            url: figures.url!,
            fetchedAt: figures.fetchedAt!,
            budget:
              changes.budgetSource === "wikipedia" ? null : figures.budget,
          },
          ...(changes.budgetSource === "wikipedia" && {
            wikipedia: { budget: figures.budget, url: ARTICLE },
          }),
        },
      })
      .where(eq(movies.id, movie.id));
  };
  const enrich = async (mode: string) => {
    if (mode === "refresh") {
      await db
        .insert(nominations)
        .values({ theatreId: THEATRE, userId: USER, movieId: movie.id });
    }
    return mode === "normal"
      ? add(request({ movieId: movie.id }), context())
      : mode === "import"
        ? importMovie(request({ title: "Interstellar" }), context())
        : refresh(request({ movieId: movie.id }), context());
  };

  beforeEach(async () => {
    await setDetails({ budget: 0, wikipediaUrl: ARTICLE });
    serve(() => budgetLead("$165&#160;million"));
  });

  it.each(["normal", "import", "refresh"])(
    "fills a budget missing from Mojo and TMDB during %s enrichment",
    async (mode) => {
      const response = await enrich(mode);
      expect(response.ok).toBe(true);
      if (mode === "refresh") {
        expect(await response.json()).toMatchObject({
          budget: 165_000_000,
          budgetSource: "wikipedia",
        });
      }
      expect(await storedDetails()).toMatchObject({
        budget: 0,
        boxOffice: {
          budget: 165_000_000,
          budgetSource: "wikipedia",
          worldwideGross: 782_948_164,
        },
      });
      const requests = wikipediaRequests();
      expect(requests).toHaveLength(1);
      expect(new URL(String(requests[0][0])).searchParams.get("page")).toBe(
        "Interstellar_(film)",
      );
    },
  );

  it.each([
    ["Mojo has a budget", mojoWith("$165,000,000"), 0, "boxofficemojo", 165e6],
    ["Mojo reports a zero budget", mojoWith("$0"), 0, "boxofficemojo", 0],
    ["TMDB has a budget", mojoWith("-"), 5e6, "tmdb", 5e6],
  ])(
    "skips Wikipedia when %s",
    async (_name, mojo, tmdb, budgetSource, budget) => {
      serve(() => budgetLead("$1 million"), mojo);
      await setDetails({ budget: tmdb });
      expect((await enrich("refresh")).status).toBe(200);
      expect(wikipediaRequests()).toHaveLength(0);
      expect(await storedDetails()).toMatchObject({
        boxOffice: { budget, budgetSource },
      });
    },
  );

  it.each([undefined, null])(
    "skips Wikipedia when the stored article is %s",
    async (wikipediaUrl) => {
      await setDetails({ wikipediaUrl });
      expect((await enrich("refresh")).status).toBe(200);
      expect(wikipediaRequests()).toHaveLength(0);
      const { boxOffice } = await storedDetails();
      expect(boxOffice).toMatchObject({
        budget: null,
        worldwideGross: 782_948_164,
      });
      expect(boxOffice).not.toHaveProperty("budgetSource");
    },
  );

  it("never requests a stored URL that isn't an English Wikipedia article", async () => {
    await setDetails({ wikipediaUrl: "https://example.com/wiki/Interstellar" });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await enrich("refresh")).status).toBe(200);
    expect(wikipediaRequests()).toHaveLength(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalled();
    expect(await storedDetails()).toHaveProperty("boxOffice.budget", null);
  });

  it("drops an earlier Wikipedia budget the article no longer lists", async () => {
    await earlier({ budget: 99_000_000 });
    serve(() => lead("<th>Box office</th><td>$782.9 million</td>"));
    expect((await enrich("refresh")).status).toBe(200);
    expect(wikipediaRequests()).toHaveLength(1);
    const { boxOffice } = await storedDetails();
    expect(boxOffice).toMatchObject({ budget: null });
  });

  it("prefers a Mojo budget over an earlier Wikipedia one", async () => {
    await earlier({ budget: 99_000_000 });
    serve(() => budgetLead("$1 million"), mojoWith("$165,000,000"));
    expect((await enrich("refresh")).status).toBe(200);
    expect(wikipediaRequests()).toHaveLength(0);
    expect(await storedDetails()).toMatchObject({
      boxOffice: { budget: 165_000_000 },
    });
  });

  describe("when Wikipedia fails", () => {
    const failures: [string, () => Response][] = [
      ["an HTTP error", () => new Response("", { status: 503 })],
      ["an API error", () => Response.json({ error: { code: "ratelimited" } })],
      ["an unexpected body", () => new Response("<html>")],
      [
        "a timeout",
        () => {
          throw new DOMException("Timed out", "TimeoutError");
        },
      ],
    ];

    it.each(failures)(
      "still saves Mojo's figures after %s",
      async (_name, failure) => {
        const log = vi
          .spyOn(console, "error")
          .mockImplementation(() => undefined);
        serve(failure);
        const response = await enrich("refresh");
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
          budget: null,
          worldwideGross: 782_948_164,
        });
        const { boxOffice } = await storedDetails();
        expect(boxOffice).toMatchObject({
          budget: null,
          worldwideGross: 782_948_164,
        });
        expect(boxOffice).not.toHaveProperty("budgetSource");
        expect(log).toHaveBeenCalledWith(
          expect.stringContaining(ARTICLE),
          expect.any(Error),
        );
      },
    );

    it("clears an earlier Wikipedia budget on failure instead of preserving history", async () => {
      await earlier({ budget: 165_000_000, budgetSource: "wikipedia" });
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      serve(() => new Response("", { status: 503 }));
      expect((await enrich("refresh")).status).toBe(200);
      expect(await storedDetails()).toMatchObject({
        boxOffice: {
          budget: null,
          worldwideGross: 782_948_164,
        },
      });
    });

    it.each([{ budgetSource: "tmdb" }, {}] as const)(
      "doesn't keep an earlier budget from elsewhere (%j)",
      async (source) => {
        await earlier({ budget: 7_000_000, ...source });
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        serve(() => new Response("", { status: 503 }));
        expect((await enrich("refresh")).status).toBe(200);
        const { boxOffice } = await storedDetails();
        expect(boxOffice).toMatchObject({ budget: null });
        expect(boxOffice).not.toHaveProperty("budgetSource");
      },
    );

    it("keeps the nomination when it fails while adding a movie", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      serve(() => new Response("", { status: 503 }));
      expect((await enrich("normal")).status).toBe(201);
      expect(await db.select().from(nominations)).toHaveLength(1);
      expect(await storedDetails()).toMatchObject({
        boxOffice: { budget: null, worldwideGross: 782_948_164 },
      });
    });
  });
});

describe("manual budgets", () => {
  beforeEach(async () => {
    await db.insert(nominations).values({
      theatreId: THEATRE,
      userId: USER,
      movieId: movie.id,
    });
  });

  const save = (budget: unknown, theatreId = THEATRE) =>
    saveBudget(request({ movieId: movie.id, budget }), context(theatreId));

  it("saves a missing budget without requiring IMDb or any external lookup", async () => {
    await db
      .update(movies)
      .set({
        details: { ...movie.details, imdb_id: null },
      })
      .where(eq(movies.id, movie.id));
    expect((await save(25_000_000)).status).toBe(204);
    expect(await storedDetails()).toMatchObject({
      budget: 1,
      revenue: 2,
      justWatch: { status: "matched", offers: [] },
      boxOffice: {
        source: "manual",
        budgetSource: "manual",
        budget: 25_000_000,
        worldwideGross: null,
        currency: "USD",
      },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("overrides a known budget, preserves grosses, and updates standings", async () => {
    await refresh(request({ movieId: movie.id }), context());
    const before = await storedDetails();
    expect((await save(25_000_000)).status).toBe(204);
    const details = await storedDetails();
    expect(details.boxOffice).toEqual({
      ...before.boxOffice,
      budget: 25_000_000,
      budgetSource: "manual",
    });
    const nom = nomination(99, "maya", "Interstellar", null, null);
    const standings = buildStandings([
      {
        ...nom,
        movie: { ...nom.movie, details },
      },
    ]);
    expect(standings.movies[0]).toMatchObject({
      status: "scored",
      net: 782_948_164 - 25_000_000,
    });
  });

  it.each([0, 25_000_000])(
    "keeps a manual budget of %s through refresh",
    async (budget) => {
      await save(budget);
      const response = await refresh(request({ movieId: movie.id }), context());
      expect(await response.json()).toMatchObject({
        source: "boxofficemojo",
        budget,
        budgetSource: "manual",
        worldwideGross: 782_948_164,
      });
      expect(await storedDetails()).toHaveProperty("boxOffice.budget", budget);
    },
  );

  it.each([undefined, null, "", "100", -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid budget %s without writing",
    async (budget) => {
      expect((await save(budget)).status).toBe(400);
      expect(await storedDetails()).not.toHaveProperty("boxOffice");
    },
  );

  it("rejects signed-out saves", async () => {
    auth.userId = "";
    expect((await save(100)).status).toBe(401);
    expect(await storedDetails()).not.toHaveProperty("boxOffice");
  });

  it("allows signed-in nonmembers, matching shared metadata refresh permissions", async () => {
    await db.delete(theatreMembers);
    expect((await save(100)).status).toBe(204);
    expect(await db.select().from(theatreMembers)).toHaveLength(0);
  });

  it("does not update movies on another theatre", async () => {
    expect((await save(100, OTHER)).status).toBe(404);
    expect(await storedDetails()).not.toHaveProperty("boxOffice");
  });

  it("replaces an existing manual budget", async () => {
    await save(100);
    expect((await save(200)).status).toBe(204);
    expect(await storedDetails()).toHaveProperty("boxOffice.budget", 200);
  });

  it("stores only the manual entry and resolves it consistently across reads", async () => {
    await save(100);
    const [stored] = await db
      .select()
      .from(movies)
      .where(eq(movies.id, movie.id));
    expect(stored.boxOffice).toEqual({ manual: { budget: 100 } });
    expect(stored.details).not.toHaveProperty("boxOffice");
    const loaded = await findMovieById(movie.id);
    expect(loaded).not.toHaveProperty("boxOffice");
    expect(loaded?.details.boxOffice).toMatchObject({
      budget: 100,
      budgetSource: "manual",
    });
    auth.userId = "";
    const response = await list(
      new Request("http://test/nominations"),
      context(),
    );
    expect(response.status).toBe(200);
    const [nom] = await response.json();
    expect(nom.movie).not.toHaveProperty("boxOffice");
    expect(nom.movie.details.boxOffice).toEqual(
      JSON.parse(JSON.stringify(loaded?.details.boxOffice)),
    );
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
      theatreId: THEATRE,
      userId: USER,
      movieId: movie.id,
      completedAt: new Date(),
    });
  });

  it("refreshes a member's watched movie without changing nominations or other metadata", async () => {
    const before = await db.select().from(nominations);
    const response = await refresh(request({ movieId: movie.id }), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      budget: 165_000_000,
      worldwideGross: 782_948_164,
    });
    expect(await storedDetails()).toMatchObject({
      budget: 1,
      revenue: 2,
      justWatch: { status: "matched" },
      boxOffice: { worldwideGross: 782_948_164 },
    });
    expect(await db.select().from(nominations)).toEqual(before);
  });

  it("rejects anonymous refreshes before scraping", async () => {
    auth.userId = "";
    expect(
      (await refresh(request({ movieId: movie.id }), context())).status,
    ).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("lets a signed-in nonmember refresh shared metadata without joining", async () => {
    const outsider = "44444444-4444-4444-4444-444444444444";
    await db.insert(authUsers).values({
      id: outsider,
      name: "Outsider",
      email: "outsider@example.com",
    });
    auth.userId = outsider;
    expect(
      (await refresh(request({ movieId: movie.id }), context())).status,
    ).toBe(200);
    expect(
      await db
        .select()
        .from(theatreMembers)
        .where(eq(theatreMembers.userId, outsider)),
    ).toHaveLength(0);
  });

  it("keeps nomination creation admin-only", async () => {
    const member = "44444444-4444-4444-4444-444444444444";
    await db.insert(authUsers).values({
      id: member,
      name: "Member",
      email: "member@example.com",
    });
    await db.insert(theatreMembers).values({
      theatreId: THEATRE,
      userId: member,
      role: "member",
    });
    auth.userId = member;
    expect((await add(request({ movieId: movie.id }), context())).status).toBe(
      403,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns not found for a missing list", async () => {
    expect(
      (
        await refresh(
          request({ movieId: movie.id }),
          context("66666666-6666-6666-6666-666666666666"),
        )
      ).status,
    ).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects movies not on the authorized theatre", async () => {
    await db.delete(nominations).where(eq(nominations.theatreId, THEATRE));
    await db.insert(nominations).values({
      theatreId: OTHER,
      userId: USER,
      movieId: movie.id,
    });
    expect(
      (await refresh(request({ movieId: movie.id }), context())).status,
    ).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    null,
    {},
    { movieId: "1" },
    { movieId: 0 },
    { movieId: -1 },
    { movieId: 1.5 },
  ])("rejects invalid input %j", async (body) => {
    expect((await refresh(request(body), context())).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports a missing IMDb ID rather than returning a successful refresh", async () => {
    await db
      .update(movies)
      .set({ details: { title: "Unknown" } })
      .where(eq(movies.id, movie.id));
    expect(
      (await refresh(request({ movieId: movie.id }), context())).status,
    ).toBe(400);
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
    expect(
      (await refresh(request({ movieId: movie.id }), context())).status,
    ).toBe(404);
    expect(await storedDetails()).not.toHaveProperty("boxOffice");
  });
});

describe("nomination box office enrichment failures and imports", () => {
  it("scrapes successful imports but not duplicate imports", async () => {
    const added = await importMovie(
      request({ title: "Interstellar" }),
      context(),
    );
    expect((await added.json()).status).toBe("added");
    expect(await storedDetails()).toHaveProperty(
      "boxOffice.worldwideGross",
      782_948_164,
    );
    const duplicate = await importMovie(
      request({ title: "Interstellar" }),
      context(),
    );
    expect((await duplicate.json()).status).toBe("already_on_list");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["normal", "import"])(
    "keeps the %s nomination on a lookup failure",
    async (mode) => {
      fetch.mockRejectedValue(new DOMException("Timed out", "TimeoutError"));
      const log = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      const response =
        mode === "normal"
          ? await add(request({ movieId: movie.id }), context())
          : await importMovie(request({ title: "Interstellar" }), context());
      expect(response.status).toBe(mode === "normal" ? 201 : 200);
      expect(await db.select().from(nominations)).toHaveLength(1);
      expect(await storedDetails()).not.toHaveProperty("boxOffice");
      expect(log).toHaveBeenCalledWith(
        `Unable to load Box Office Mojo for movie ${movie.id}.`,
        expect.any(Error),
      );
    },
  );

  it.each([403, 404, 429])(
    "preserves existing figures on HTTP %s",
    async (status) => {
      const previous = {
        source: "boxofficemojo",
        currency: "USD",
        url: "https://www.boxofficemojo.com/title/tt0816692/",
        fetchedAt: "2026-01-01T00:00:00.000Z",
        budget: null,
        domesticGross: 100,
        internationalGross: 200,
        worldwideGross: 300,
      } satisfies BoxOfficeData;
      await db
        .update(movies)
        .set({
          boxOffice: { boxofficemojo: previous },
        })
        .where(eq(movies.id, movie.id));
      fetch.mockResolvedValue(new Response("", { status }));
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      expect(
        (await add(request({ movieId: movie.id }), context())).status,
      ).toBe(201);
      const [stored] = await db
        .select()
        .from(movies)
        .where(eq(movies.id, movie.id));
      expect(stored.boxOffice.boxofficemojo).toEqual(previous);
    },
  );

  it("does not save a successful-looking blocked page", async () => {
    fetch.mockImplementation(
      async () =>
        new Response("<h1>Access denied</h1>", {
          headers: { "Content-Type": "text/html" },
        }),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await add(request({ movieId: movie.id }), context())).status).toBe(
      201,
    );
    expect(await storedDetails()).not.toHaveProperty("boxOffice");
    expect(log).toHaveBeenCalled();
  });

  it("keeps the nomination when saving the fetched figures fails", async () => {
    await db.execute(sql`
      alter table movies add constraint reject_box_office
      check (box_office = '{}'::jsonb)
    `);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await add(request({ movieId: movie.id }), context())).status).toBe(
      201,
    );
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
    expect((await add(request({ movieId: movie.id }), context())).status).toBe(
      500,
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(await db.select().from(nominations)).toHaveLength(1);
  });

  it("refreshes a movie already cached through another theatre", async () => {
    await add(request({ movieId: movie.id }), context());
    await db.insert(theatreMembers).values({
      theatreId: OTHER,
      userId: USER,
      role: "admin",
    });
    fetch.mockImplementation(
      async () =>
        new Response(html.replace("$782,948,164", "$783,000,000"), {
          headers: { "Content-Type": "text/html" },
        }),
    );
    const response = await add(request({ movieId: movie.id }), context(OTHER));
    expect(response.status).toBe(201);
    expect(await storedDetails()).toHaveProperty(
      "boxOffice.worldwideGross",
      783_000_000,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("uses MDBList's IMDb id when the cached TMDB details have none", async () => {
    await db
      .update(movies)
      .set({
        details: { title: "Interstellar" },
        ratings: { services: [], raw: { ids: { imdb: "tt0816692" } } },
      })
      .where(eq(movies.id, movie.id));
    expect((await add(request({ movieId: movie.id }), context())).status).toBe(
      201,
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://www.boxofficemojo.com/title/tt0816692/",
      expect.any(Object),
    );
  });

  it("logs and skips missing or invalid IMDb IDs without guessing from the title", async () => {
    await db
      .update(movies)
      .set({
        details: { title: "Interstellar", imdb_id: "https://example.com" },
      })
      .where(eq(movies.id, movie.id));
    const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect((await add(request({ movieId: movie.id }), context())).status).toBe(
      201,
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
  });

  it.each(["normal", "import"])(
    "rejects unauthorized %s additions before scraping",
    async (mode) => {
      const response =
        mode === "normal"
          ? await add(request({ movieId: movie.id }), context(OTHER))
          : await importMovie(
              request({ title: "Interstellar" }),
              context(OTHER),
            );
      expect(response.status).toBe(404);
      expect(fetch).not.toHaveBeenCalled();
      expect(await db.select().from(nominations)).toHaveLength(0);
    },
  );

  it("does not lose metadata changed while the lookup is running", async () => {
    fetch.mockImplementation(async () => {
      await db
        .update(movies)
        .set({
          details: {
            ...movie.details,
            description: "Changed during the request",
          },
        })
        .where(eq(movies.id, movie.id));
      return page();
    });
    expect((await add(request({ movieId: movie.id }), context())).status).toBe(
      201,
    );
    expect(await storedDetails()).toMatchObject({
      description: "Changed during the request",
      boxOffice: { worldwideGross: 782_948_164 },
    });
  });
});
