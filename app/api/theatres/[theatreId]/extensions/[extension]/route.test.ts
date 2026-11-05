import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@/src/db/test-db";
import { setDbForTesting, type DB } from "@/src/db/client";
import { authUsers } from "@/src/db/neon-auth-schema";
import {
  movies,
  nominations,
  theatreMembers,
  theatres,
  type Movie,
  type Nomination,
} from "@/src/db/schema";
import {
  setMovieProviderForTesting,
  type MovieMetadataProvider,
} from "@/app/lib/movie-metadata";
import { POST } from "./route";

const auth = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth/server", () => ({
  getSession: async () => (auth.userId ? { user: { id: auth.userId } } : null),
}));

const llm = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@/app/lib/llm", () => llm);

const OWNER = "11111111-1111-1111-1111-111111111111";
const MEMBER = "22222222-2222-2222-2222-222222222222";
const OUTSIDER = "33333333-3333-3333-3333-333333333333";
const THEATRE = "44444444-4444-4444-4444-444444444444";
const OTHER = "55555555-5555-5555-5555-555555555555";
const MISSING = "66666666-6666-6666-6666-666666666666";
const HEIST = "Heist movies #specific";

const context = (theatreId = THEATRE, extension = "specific") => ({
  params: Promise.resolve({ theatreId, extension }),
});
const request = (body: unknown) =>
  new Request("http://test/extensions/specific", {
    method: "POST",
    body: JSON.stringify(body),
  });

let db: TestDb;
let close: () => Promise<void>;
let heat: Movie;
let ronin: Movie;
const bestMatch = vi.fn<MovieMetadataProvider["bestMatch"]>();

const storeMovie = async (tmdbId: number, title: string, year: number) => {
  const details = { id: tmdbId, title, year } as Movie["details"];
  const ratings = { services: [], raw: {} } as Movie["ratings"];
  const [row] = await db
    .insert(movies)
    .values({ tmdbId, details, ratings })
    .returning();
  return { ...row, details, ratings } as Movie;
};

const modelSays = (...picks: [title: string, year: number, reason: string][]) =>
  llm.generate.mockResolvedValue({
    movies: picks.map(([title, year, reason]) => ({ title, year, reason })),
  });

const suggest = async (body: unknown = {}, theatreId = THEATRE) => {
  const response = await POST(request(body), context(theatreId));
  return { response, json: await response.json() };
};

const titlesOf = (suggestions: Nomination[]) =>
  suggestions.map(({ movie }) => movie.details.title);

const extensionsOf = async (id = THEATRE) => {
  const [row] = await db
    .select({ extensions: theatres.extensions })
    .from(theatres)
    .where(eq(theatres.id, id));
  return row.extensions;
};

const suggestedAt = async (id = THEATRE) =>
  ((await extensionsOf(id)).specific as { suggestedAt?: string } | undefined)
    ?.suggestedAt ?? null;

const setExtensions = (extensions: Record<string, unknown>) =>
  db.update(theatres).set({ extensions }).where(eq(theatres.id, THEATRE));

const suggestedSecondsAgo = (seconds: number) =>
  setExtensions({
    specific: {
      suggestedAt: new Date(Date.now() - seconds * 1000).toISOString(),
    },
  });

const sent = () =>
  llm.generate.mock.calls[0][1] as { instructions: string; prompt: string };

beforeEach(async () => {
  const created = await createTestDb();
  db = created.db;
  close = () => created.client.close();
  setDbForTesting(() => db as unknown as DB);
  auth.userId = OWNER;
  llm.generate.mockReset();
  bestMatch.mockReset();
  setMovieProviderForTesting({
    hasCredentials: () => true,
    bestMatch,
    get: vi.fn(),
    search: vi.fn(),
  });
  await db.insert(authUsers).values([
    { id: OWNER, name: "Owner", email: "owner@example.com" },
    { id: MEMBER, name: "Member", email: "member@example.com" },
    { id: OUTSIDER, name: "Outsider", email: "outsider@example.com" },
  ]);
  await db.insert(theatres).values([
    {
      id: THEATRE,
      name: "Heists",
      description: HEIST,
      createdBy: OWNER,
      inviteCode: "a",
      adminInviteCode: "admin-a",
    },
    {
      id: OTHER,
      name: "Other",
      description: HEIST,
      createdBy: OWNER,
      inviteCode: "b",
      adminInviteCode: "admin-b",
    },
  ]);
  await db.insert(theatreMembers).values([
    { theatreId: THEATRE, userId: OWNER, role: "admin" },
    { theatreId: THEATRE, userId: MEMBER, role: "member" },
    { theatreId: OTHER, userId: OWNER, role: "admin" },
  ]);
  heat = await storeMovie(1, "Heat", 1995);
  ronin = await storeMovie(2, "Ronin", 1998);
  const catalog: Record<string, Movie> = { Heat: heat, Ronin: ronin };
  bestMatch.mockImplementation(async (title) => catalog[title] ?? null);
  modelSays(
    ["Heat", 1995, "A crew and a cop."],
    ["Ronin", 1998, "Pros on a job gone wrong."],
  );
});

afterEach(async () => {
  vi.restoreAllMocks();
  await close();
});

describe("movie suggestions", () => {
  it("returns the model's picks as nominations that are never saved", async () => {
    const { response, json } = await suggest();

    expect(response.status).toBe(200);
    expect(json.suggestions).toEqual([
      expect.objectContaining({
        id: -heat.id,
        theatreId: THEATRE,
        userId: OWNER,
        movieId: heat.id,
        comment: "A crew and a cop.",
        completedAt: null,
        nomcoms: [],
        seenBy: [],
        nominator: { id: OWNER, name: "Owner", username: "owner" },
        movie: expect.objectContaining({
          id: heat.id,
          details: expect.objectContaining({ title: "Heat" }),
        }),
      }),
      expect.objectContaining({
        id: -ronin.id,
        comment: "Pros on a job gone wrong.",
      }),
    ]);
    expect(bestMatch.mock.calls).toEqual([
      ["Heat", 1995],
      ["Ronin", 1998],
    ]);
    expect(await db.select().from(nominations)).toHaveLength(0);
  });

  it.each([
    ["unauthenticated", "", THEATRE, 401],
    ["non-admin member", MEMBER, THEATRE, 403],
    ["nonmember", OUTSIDER, THEATRE, 404],
    ["other theatre", MEMBER, OTHER, 404],
    ["missing theatre", MEMBER, MISSING, 404],
  ])(
    "rejects %s before spending anything",
    async (_name, userId, id, status) => {
      auth.userId = userId;

      expect((await suggest({}, id)).response.status).toBe(status);
      expect(llm.generate).not.toHaveBeenCalled();
      expect(await suggestedAt()).toBeNull();
    },
  );

  it.each([null, "", "Heist movies", "Heist movies #specifically"])(
    "refuses a list that isn't tagged #specific (%j)",
    async (description) => {
      await db
        .update(theatres)
        .set({ description })
        .where(eq(theatres.id, THEATRE));

      const { response, json } = await suggest();

      expect(response.status).toBe(400);
      expect(json).toEqual({
        error: "That only works on lists tagged #specific.",
      });
      expect(llm.generate).not.toHaveBeenCalled();
      expect(await suggestedAt()).toBeNull();
    },
  );

  it.each(["nope", "SPECIFIC", "__proto__", "constructor", "toString", ""])(
    "answers 404 for an unknown extension (%j)",
    async (extension) => {
      const response = await POST(request({}), context(THEATRE, extension));

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: "That extension does not exist.",
      });
      expect(llm.generate).not.toHaveBeenCalled();
      expect(await suggestedAt()).toBeNull();
    },
  );

  it.each([
    { exclude: "Heat" },
    { exclude: [1] },
    { exclude: [""] },
    { exclude: ["  "] },
    { exclude: ["a".repeat(201)] },
    { exclude: Array.from({ length: 101 }, () => "Heat") },
  ])("rejects invalid input %#", async (body) => {
    expect((await suggest(body)).response.status).toBe(400);
    expect(llm.generate).not.toHaveBeenCalled();
    expect(await suggestedAt()).toBeNull();
  });

  it("accepts the largest exclude list", async () => {
    const exclude = Array.from({ length: 100 }, () => "a".repeat(200));
    expect((await suggest({ exclude })).response.status).toBe(200);
  });

  it.each([undefined, "", "{", "null", "{}"])(
    "reads a missing or empty body (%j) as nothing to exclude",
    async (body) => {
      const response = await POST(
        new Request("http://test/extensions/specific", {
          method: "POST",
          body,
        }),
        context(),
      );
      expect(response.status).toBe(200);
      expect(sent().prompt).toContain("<already_suggested>\n\n</already");
    },
  );

  it("reports missing movie credentials before spending anything", async () => {
    setMovieProviderForTesting({
      hasCredentials: () => false,
      bestMatch,
      get: vi.fn(),
      search: vi.fn(),
    });

    const { response } = await suggest();

    expect(response.status).toBe(503);
    expect(llm.generate).not.toHaveBeenCalled();
    expect(await suggestedAt()).toBeNull();
  });
});

describe("movie suggestion cooldown", () => {
  it("allows one request per theatre every 10 seconds", async () => {
    expect((await suggest()).response.status).toBe(200);

    const second = await suggest();

    expect(second.response.status).toBe(429);
    expect(second.json).toEqual({
      error: "Give it a few seconds, then try again.",
    });
    expect(llm.generate).toHaveBeenCalledOnce();
  });

  it("lets a request through once the cooldown is over", async () => {
    await suggestedSecondsAgo(5);
    expect((await suggest()).response.status).toBe(429);

    await suggestedSecondsAgo(11);
    expect((await suggest()).response.status).toBe(200);
  });

  it("only lets one of two simultaneous requests reach the model", async () => {
    const results = await Promise.all([suggest(), suggest()]);

    expect(results.map(({ response }) => response.status).sort()).toEqual([
      200, 429,
    ]);
    expect(llm.generate).toHaveBeenCalledOnce();
  });

  it("keeps each theatre's cooldown separate", async () => {
    await suggest();
    expect((await suggest({}, OTHER)).response.status).toBe(200);
  });

  it.each([
    [{ specific: { note: "hi" }, other: { keep: 1 } }, { note: "hi" }],
    [{ specific: "junk", other: true }, {}],
    [{ specific: null, other: [1] }, {}],
    [{ specific: [1], other: null }, {}],
  ])(
    "records the request without touching other data (%j)",
    async (before, kept) => {
      await setExtensions(before);

      expect((await suggest()).response.status).toBe(200);

      expect(await extensionsOf()).toEqual({
        ...before,
        specific: { ...kept, suggestedAt: expect.any(String) },
      });
      expect(await extensionsOf(OTHER)).toEqual({});
    },
  );
});

describe("movie suggestion failures", () => {
  it("reports a model failure, logging only its message", async () => {
    const error = Object.assign(new Error("gateway down"), {
      requestBodyValues: { prompt: "PRIVATE PROMPT" },
    });
    llm.generate.mockRejectedValue(error);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { response, json } = await suggest();

    expect(response.status).toBe(502);
    expect(json).toEqual({
      error: "Couldn't get suggestions right now. Try again.",
    });
    expect(log).toHaveBeenCalledWith("Suggestions failed:", "gateway down");
    expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE PROMPT");
    // A failed try still counts, so the model can't be hammered.
    expect((await suggest()).response.status).toBe(429);
  });

  it("reports a failure, not an empty list, when every lookup fails", async () => {
    bestMatch.mockRejectedValue(new Error("TMDB is down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect((await suggest()).response.status).toBe(502);
  });

  it("keeps the movies it could look up when others fail", async () => {
    bestMatch.mockImplementation(async (title) => {
      if (title === "Ronin") throw new Error("TMDB hiccup");
      return heat;
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { response, json } = await suggest();

    expect(response.status).toBe(200);
    expect(titlesOf(json.suggestions)).toEqual(["Heat"]);
  });

  it("returns an empty list, not an error, when the model has no ideas", async () => {
    modelSays();

    const { response, json } = await suggest();

    expect(response.status).toBe(200);
    expect(json).toEqual({ suggestions: [] });
    expect(bestMatch).not.toHaveBeenCalled();
  });
});

describe("movie suggestion filtering", () => {
  it.each([false, true])(
    "drops movies already on the list (completed=%s)",
    async (completed) => {
      await db.insert(nominations).values({
        theatreId: THEATRE,
        userId: OWNER,
        movieId: heat.id,
        completedAt: completed ? new Date() : null,
      });

      const { json } = await suggest();

      expect(titlesOf(json.suggestions)).toEqual(["Ronin"]);
    },
  );

  it("still suggests a movie that is only on another theatre's list", async () => {
    await db
      .insert(nominations)
      .values({ theatreId: OTHER, userId: OWNER, movieId: heat.id });

    const { json } = await suggest();

    expect(titlesOf(json.suggestions)).toEqual(["Heat", "Ronin"]);
  });

  it("drops titles TMDB can't confirm and repeated movies", async () => {
    modelSays(
      ["Made Up", 2001, "x"],
      ["Heat", 1995, "first"],
      ["Heat", 1995, "second"],
    );

    const { json } = await suggest();

    expect(json.suggestions).toEqual([
      expect.objectContaining({ movieId: heat.id, comment: "first" }),
    ]);
  });
});

describe("movie suggestion prompt", () => {
  it("sends the description, this theatre's whole list and what was already offered", async () => {
    await db.insert(nominations).values([
      {
        theatreId: THEATRE,
        userId: OWNER,
        movieId: heat.id,
        completedAt: new Date(),
      },
      { theatreId: OTHER, userId: OWNER, movieId: ronin.id },
    ]);

    await suggest({ exclude: ["Ocean's Eleven", " Inside Man "] });

    expect(sent().prompt).toContain(
      "<description>\nHeist movies #specific\n</description>",
    );
    expect(sent().prompt).toContain(
      "<already_added>\nHeat (1995)\n</already_added>",
    );
    expect(sent().prompt).toContain(
      "<already_suggested>\nOcean's Eleven\nInside Man\n</already_suggested>",
    );
    expect(sent().instructions).not.toContain("Heist");
  });
});
