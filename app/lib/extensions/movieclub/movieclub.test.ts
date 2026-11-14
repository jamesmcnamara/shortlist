import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { map } from "shades";
import * as extensionRoute from "@/app/api/theatres/[theatreId]/extensions/[extension]/route";
import * as nominationsRoute from "@/app/api/theatres/[theatreId]/nominations/route";
import * as joinRoute from "@/app/api/join/[code]/route";
import { setMovieProviderForTesting } from "@/app/lib/movie-metadata";
import { setDbForTesting, type DB } from "@/src/db/client";
import { authUsers } from "@/src/db/neon-auth-schema";
import {
  movies,
  nominations,
  theatreMembers,
  theatres,
  type Nomination,
} from "@/src/db/schema";
import { createTestDb, type TestDb } from "@/src/db/test-db";
import { votersOf } from "./shared";

const auth = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth/server", () => ({
  getSession: async () => (auth.userId ? { user: { id: auth.userId } } : null),
}));

const OWNER = "11111111-1111-1111-1111-111111111111";
const ALICE = "22222222-2222-2222-2222-222222222222";
const BOB = "33333333-3333-3333-3333-333333333333";
const OUTSIDER = "44444444-4444-4444-4444-444444444444";
const CLUB = "55555555-5555-5555-5555-555555555555";
const PLAIN = "66666666-6666-6666-6666-666666666666";

let db: TestDb;
let close: () => Promise<void>;

const asUser = (userId: string) => {
  auth.userId = userId;
};
const post = (json: unknown) =>
  new Request("http://test/api", {
    method: "POST",
    body: JSON.stringify(json),
  });
const inTheatre = (theatreId: string) => ({
  params: Promise.resolve({ theatreId }),
});

const voteWith = (json: unknown, theatreId = CLUB) =>
  extensionRoute.POST(post(json), {
    params: Promise.resolve({ theatreId, extension: "movieclub" }),
  });
const vote = (action: string, nominationId: number, theatreId = CLUB) =>
  voteWith({ action, nominationId }, theatreId);

const addNomination = (movieId: number, theatreId = CLUB) =>
  nominationsRoute.POST(post({ movieId }), inTheatre(theatreId));
const removeNomination = (id: number, theatreId = CLUB) =>
  nominationsRoute.DELETE(
    new Request(`http://test/api?id=${id}`, { method: "DELETE" }),
    inTheatre(theatreId),
  );
const listed = async (theatreId = CLUB): Promise<Nomination[]> =>
  (
    await nominationsRoute.GET(
      new Request("http://test/api"),
      inTheatre(theatreId),
    )
  ).json();
const votersFor = async (id: number) =>
  map("username")(votersOf((await listed()).find((n) => n.id === id)!));

const storeMovie = async (tmdbId: number) => {
  const [movie] = await db
    .insert(movies)
    .values({
      tmdbId,
      details: { title: `Movie ${tmdbId}` },
      ratings: { services: [], raw: {} },
    })
    .returning({ id: movies.id });
  return movie;
};

/** Puts a nomination straight in the database, so the monthly limit doesn't apply. */
const nominate = async (
  userId: string,
  tmdbId: number,
  extra: Partial<typeof nominations.$inferInsert> = {},
  theatreId = CLUB,
) => {
  const movie = await storeMovie(tmdbId);
  const [nomination] = await db
    .insert(nominations)
    .values({ theatreId, userId, movieId: movie.id, ...extra })
    .returning();
  return nomination;
};
const nominateMany = (count: number) =>
  Promise.all(Array.from({ length: count }, (_, i) => nominate(OWNER, i + 1)));

/** One at a time, since each write replaces a person's allocation. */
const voteForAll = async (ids: number[]) => {
  for (const id of ids) await vote("vote", id);
};

beforeEach(async () => {
  const created = await createTestDb();
  db = created.db;
  close = () => created.client.close();
  setDbForTesting(() => db as unknown as DB);
  auth.userId = "";
  setMovieProviderForTesting({
    hasCredentials: () => true,
    bestMatch: vi.fn(),
    search: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
  });

  await db.insert(authUsers).values([
    { id: OWNER, name: "Owner", email: "owner@example.com" },
    { id: ALICE, name: "Alice", email: "alice@example.com" },
    { id: BOB, name: "Bob", email: "bob@example.com" },
    { id: OUTSIDER, name: "Outsider", email: "outsider@example.com" },
  ]);
  await db.insert(theatres).values([
    {
      id: CLUB,
      name: "Club",
      description: "Friday picks #movieclub",
      createdBy: OWNER,
      inviteCode: "club-code",
      adminInviteCode: "club-admin",
    },
    {
      id: PLAIN,
      name: "Plain",
      description: "Just a list",
      createdBy: OWNER,
      inviteCode: "plain-code",
      adminInviteCode: "plain-admin",
    },
  ]);
  await db.insert(theatreMembers).values([
    { theatreId: CLUB, userId: OWNER, role: "admin" },
    { theatreId: CLUB, userId: ALICE, role: "member" },
    { theatreId: CLUB, userId: BOB, role: "member" },
    { theatreId: PLAIN, userId: OWNER, role: "admin" },
    { theatreId: PLAIN, userId: ALICE, role: "member" },
  ]);
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await close();
});

describe("movie club voting", () => {
  it("records a vote and shows who voted", async () => {
    const nomination = await nominate(OWNER, 1);
    asUser(ALICE);

    const response = await vote("vote", nomination.id);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ votesLeft: 4 });
    expect(await votersFor(nomination.id)).toEqual(["alice"]);
  });

  it("takes a vote back", async () => {
    const nomination = await nominate(OWNER, 1);
    asUser(ALICE);
    await vote("vote", nomination.id);

    const response = await vote("unvote", nomination.id);

    expect(await response.json()).toEqual({ votesLeft: 5 });
    expect(await votersFor(nomination.id)).toEqual([]);
  });

  it("lets a member put all five votes on one movie and remove them one at a time", async () => {
    const nomination = await nominate(OWNER, 1);
    asUser(ALICE);
    await voteForAll(Array(4).fill(nomination.id));

    const response = await vote("vote", nomination.id);

    expect(await response.json()).toEqual({ votesLeft: 0 });
    expect(await votersFor(nomination.id)).toEqual(Array(5).fill("alice"));
    expect((await vote("vote", nomination.id)).status).toBe(409);

    expect(await (await vote("unvote", nomination.id)).json()).toEqual({
      votesLeft: 1,
    });
    expect(await votersFor(nomination.id)).toEqual(Array(4).fill("alice"));
    expect(await (await vote("vote", nomination.id)).json()).toEqual({
      votesLeft: 0,
    });
  });

  it("removes only one of your votes without affecting other movies or members", async () => {
    const [first, second] = await nominateMany(2);
    asUser(BOB);
    await vote("vote", first.id);
    asUser(ALICE);
    await voteForAll([first.id, second.id, first.id]);

    expect(await (await vote("unvote", first.id)).json()).toEqual({
      votesLeft: 3,
    });
    expect(await votersFor(first.id)).toEqual(["alice", "bob"]);
    expect(await votersFor(second.id)).toEqual(["alice"]);

    await vote("unvote", first.id);
    expect(await (await vote("unvote", first.id)).json()).toEqual({
      votesLeft: 4,
    });
    expect(await votersFor(first.id)).toEqual(["bob"]);
    expect(await votersFor(second.id)).toEqual(["alice"]);
  });

  it("keeps each member's votes separate, listed by username", async () => {
    const nomination = await nominate(OWNER, 1);
    asUser(BOB);
    await vote("vote", nomination.id);
    asUser(ALICE);
    await vote("vote", nomination.id);
    expect(await votersFor(nomination.id)).toEqual(["alice", "bob"]);

    await vote("unvote", nomination.id);

    expect(await votersFor(nomination.id)).toEqual(["bob"]);
  });

  it("gives each member five votes a month", async () => {
    const picks = await nominateMany(6);
    const [first, ...rest] = map("id")(picks);
    asUser(ALICE);
    await voteForAll([first, ...rest.slice(0, 4)]);

    const sixth = await vote("vote", rest[4]);
    expect(sixth.status).toBe(409);
    expect(await sixth.json()).toEqual({
      error: "You're out of votes this month.",
    });

    const repeat = await vote("vote", first);
    expect(repeat.status).toBe(409);

    await vote("unvote", first);
    expect((await vote("vote", rest[4])).status).toBe(200);
  });

  it("starts everyone over with five votes in a new month", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime("2026-03-15T12:00:00Z");
    const ids = map("id")(await nominateMany(6));
    asUser(ALICE);
    await voteForAll(ids.slice(0, 5));
    expect((await vote("vote", ids[5])).status).toBe(409);

    vi.setSystemTime("2026-04-01T12:00:00Z");

    expect(await votersFor(ids[0])).toEqual([]);
    const response = await vote("vote", ids[5]);
    expect(await response.json()).toEqual({ votesLeft: 4 });
  });

  it("gives votes back when a nomination is watched or removed", async () => {
    const [watched, removed, open] = await nominateMany(3);
    asUser(ALICE);
    await voteForAll([watched.id, removed.id, watched.id, removed.id]);
    await db
      .update(nominations)
      .set({ completedAt: new Date() })
      .where(eq(nominations.id, watched.id));
    await db.delete(nominations).where(eq(nominations.id, removed.id));

    const response = await vote("vote", open.id);

    expect(await response.json()).toEqual({ votesLeft: 4 });
    expect(await votersFor(watched.id)).toEqual([]);
  });

  it("won't let you vote for your own nomination", async () => {
    const mine = await nominate(ALICE, 1);
    asUser(ALICE);

    const response = await vote("vote", mine.id);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "You can't vote for your own nomination.",
    });
  });

  it("only finds open nominations on this list", async () => {
    const watched = await nominate(OWNER, 1, { completedAt: new Date() });
    const elsewhere = await nominate(OWNER, 2, {}, PLAIN);
    asUser(ALICE);

    const responses = await Promise.all(
      [watched.id, elsewhere.id, 999_999].map((id) => vote("vote", id)),
    );

    expect(map("status")(responses)).toEqual([404, 404, 404]);
  });

  it.each([
    ["nothing", {}, "Choose whether to vote or unvote."],
    [
      "an unknown action",
      { action: "like", nominationId: 1 },
      "Choose whether to vote or unvote.",
    ],
    ["no nomination", { action: "vote" }, "Choose a nomination to vote on."],
    [
      "a nomination that isn't an id",
      { action: "vote", nominationId: "one" },
      "Choose a nomination to vote on.",
    ],
  ])("rejects %s", async (_name, json, message) => {
    asUser(ALICE);

    const response = await voteWith(json);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: message });
  });

  it("only works on lists tagged #movieclub", async () => {
    const nomination = await nominate(OWNER, 1, {}, PLAIN);
    asUser(ALICE);

    const response = await vote("vote", nomination.id, PLAIN);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "That only works on lists tagged #movieclub.",
    });
  });

  it.each([
    ["signed out", "", 401],
    ["not in the club", OUTSIDER, 404],
  ])("turns away someone who is %s", async (_who, userId, status) => {
    const nomination = await nominate(OWNER, 1);
    asUser(userId);

    expect((await vote("vote", nomination.id)).status).toBe(status);

    asUser(ALICE);
    expect(await votersFor(nomination.id)).toEqual([]);
  });
});

describe("movie club nominating", () => {
  it("lets members nominate more than once and remove their own picks on ordinary lists", async () => {
    const [first, second] = [await storeMovie(1), await storeMovie(2)];
    asUser(ALICE);

    const added = await addNomination(first.id, PLAIN);
    const id = (await added.json()).id;
    const another = await addNomination(second.id, PLAIN);
    const removed = await removeNomination(id, PLAIN);

    expect(map("status")([added, another, removed])).toEqual([201, 201, 204]);
  });

  it.each([
    ["signed out", "", 401],
    ["not a member", OUTSIDER, 404],
  ])(
    "doesn't let someone %s nominate or delete",
    async (_who, userId, status) => {
      const existing = await nominate(ALICE, 1, {}, PLAIN);
      const movie = await storeMovie(2);
      asUser(userId);

      expect((await addNomination(movie.id, PLAIN)).status).toBe(status);
      expect((await removeNomination(existing.id, PLAIN)).status).toBe(status);
    },
  );

  it("lets a member nominate on a movie club", async () => {
    const movie = await storeMovie(1);
    asUser(ALICE);

    const response = await addNomination(movie.id);

    expect(response.status).toBe(201);
    expect((await response.json()).userId).toBe(ALICE);
  });

  it.each([
    ["a member", ALICE],
    ["an admin", OWNER],
  ])("allows %s one nomination a month", async (_who, userId) => {
    const [first, second] = [await storeMovie(1), await storeMovie(2)];
    asUser(userId);
    expect((await addNomination(first.id)).status).toBe(201);

    const refused = await addNomination(second.id);

    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({
      error: "You can only nominate one per month, remove Movie 1.",
    });
    const mine = await db
      .select({ id: nominations.id })
      .from(nominations)
      .where(eq(nominations.userId, userId));
    expect(mine).toHaveLength(1);
  });

  it("lets you nominate again once you've removed your nomination", async () => {
    const [first, second] = [await storeMovie(1), await storeMovie(2)];
    asUser(ALICE);
    const { id } = await (await addNomination(first.id)).json();

    expect((await removeNomination(id)).status).toBe(204);

    expect((await addNomination(second.id)).status).toBe(201);
  });

  it("doesn't count a nomination that's already been watched", async () => {
    await nominate(ALICE, 1, { completedAt: new Date() });
    const movie = await storeMovie(2);
    asUser(ALICE);

    expect((await addNomination(movie.id)).status).toBe(201);
  });

  it("doesn't count other people's nominations", async () => {
    await nominate(BOB, 1);
    const movie = await storeMovie(2);
    asUser(ALICE);

    expect((await addNomination(movie.id)).status).toBe(201);
  });

  it.each([
    ["2026-05-01T06:59:00Z", 201],
    ["2026-05-01T07:01:00Z", 409],
  ])(
    "starts a new month at midnight Pacific (nominated %s, nominating again gets %i)",
    async (createdAt, status) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime("2026-05-15T12:00:00Z");
      await nominate(ALICE, 1, { createdAt: new Date(createdAt) });
      const movie = await storeMovie(2);
      asUser(ALICE);

      expect((await addNomination(movie.id)).status).toBe(status);
    },
  );

  it.each([
    ["a movie club", CLUB],
    ["an ordinary list", PLAIN],
  ])(
    "lets members remove only their own nominations on %s, including watched picks",
    async (_name, theatreId) => {
      const mine = await nominate(ALICE, 1, {}, theatreId);
      const owners = await nominate(OWNER, 2, {}, theatreId);
      const watched = await nominate(
        ALICE,
        3,
        { completedAt: new Date() },
        theatreId,
      );
      asUser(ALICE);

      const responses = await Promise.all(
        [mine, owners, watched].map(({ id }) =>
          removeNomination(id, theatreId),
        ),
      );

      expect(map("status")(responses)).toEqual([204, 404, 204]);
      expect(await db.select({ id: nominations.id }).from(nominations)).toEqual(
        [{ id: owners.id }],
      );
    },
  );

  it("lets admins remove anyone's nomination", async () => {
    const bobs = await nominate(BOB, 1);
    asUser(OWNER);

    expect((await removeNomination(bobs.id)).status).toBe(204);
  });

  it("still leaves completing a nomination to admins", async () => {
    const mine = await nominate(ALICE, 1);
    asUser(ALICE);

    const response = await nominationsRoute.PATCH(
      new Request("http://test/api", {
        method: "PATCH",
        body: JSON.stringify({
          id: mine.id,
          completedAt: new Date().toISOString(),
        }),
      }),
      inTheatre(CLUB),
    );

    expect(response.status).toBe(403);
  });
});

describe("movie club voters on nominations", () => {
  it("lists each open nomination's voters, and nobody on watched ones", async () => {
    const [open, watched] = await nominateMany(2);
    asUser(ALICE);
    await voteForAll([open.id, watched.id]);
    asUser(BOB);
    await vote("vote", open.id);
    await db
      .update(nominations)
      .set({ completedAt: new Date() })
      .where(eq(nominations.id, watched.id));

    expect(await votersFor(open.id)).toEqual(["alice", "bob"]);
    expect(await votersFor(watched.id)).toEqual([]);
  });

  it("adds nothing to lists that aren't movie clubs", async () => {
    await nominate(OWNER, 1, {}, PLAIN);

    const [nomination] = await listed(PLAIN);

    expect(nomination.extensions).toBeUndefined();
  });

  it("shows voters in the public preview of a movie club", async () => {
    const nomination = await nominate(OWNER, 1);
    asUser(ALICE);
    await vote("vote", nomination.id);
    asUser("");

    const response = await joinRoute.GET(new Request("http://test/api"), {
      params: Promise.resolve({ code: "club-code" }),
    });

    const { nominations: shown } = await response.json();
    expect(map("username")(votersOf(shown[0]))).toEqual(["alice"]);
  });
});
