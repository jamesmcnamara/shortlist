import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { map } from "shades";
import webpush from "web-push";
import * as cronRoute from "@/app/api/cron/daily/route";
import * as extensionRoute from "@/app/api/theatres/[theatreId]/extensions/[extension]/route";
import * as nominationsRoute from "@/app/api/theatres/[theatreId]/nominations/route";
import * as preferencesRoute from "@/app/api/theatres/[theatreId]/notifications/route";
import { updateTheatre } from "@/app/lib/theatre-tags";
import { setDbForTesting, type DB } from "@/src/db/client";
import { authUsers } from "@/src/db/neon-auth-schema";
import {
  movies,
  nominations,
  notifications,
  subscriptions,
  theatreMembers,
  theatres,
} from "@/src/db/schema";
import { createTestDb, type TestDb } from "@/src/db/test-db";
import { cycleOf } from "./cycle";

const state = vi.hoisted(() => ({
  userId: "",
  tasks: [] as (() => Promise<void>)[],
}));
vi.mock("@/lib/auth/server", () => ({
  getSession: async () =>
    state.userId ? { user: { id: state.userId } } : null,
}));
vi.mock("next/server", () => ({
  after: (callback: () => Promise<void>) => state.tasks.push(callback),
}));
vi.mock("web-push", async (importOriginal) => {
  const original = await importOriginal<typeof import("web-push")>();
  return { default: { ...original, sendNotification: vi.fn() } };
});

const OWNER = "11111111-1111-1111-1111-111111111111";
const ALICE = "22222222-2222-2222-2222-222222222222";
const BOB = "33333333-3333-3333-3333-333333333333";
const CLUB = "55555555-5555-5555-5555-555555555555";
const PLAIN = "66666666-6666-6666-6666-666666666666";
const DEVICE = "https://fcm.googleapis.com/fcm/send/";
const SECRET = "test-cron-secret";

let db: TestDb;
let close: () => Promise<void>;

const asUser = (userId: string) => {
  state.userId = userId;
};
const request = (body: unknown, method = "POST", url = "http://test/api") =>
  new Request(url, { method, body: JSON.stringify(body) });
const inTheatre = (theatreId = CLUB) => ({
  params: Promise.resolve({ theatreId }),
});

const vote = (action: string, nominationId: number) =>
  extensionRoute.POST(request({ action, nominationId }), {
    params: Promise.resolve({ theatreId: CLUB, extension: "movieclub" }),
  });
const removeNomination = (id: number) =>
  nominationsRoute.DELETE(
    new Request(`http://test/api?id=${id}`, { method: "DELETE" }),
    inTheatre(),
  );
const setWatched = (id: number, completedAt: string | null) =>
  nominationsRoute.PATCH(request({ id, completedAt }, "PATCH"), inTheatre());
const choose = (body: unknown) =>
  preferencesRoute.PATCH(request(body, "PATCH"), inTheatre());
const runDaily = (authorization = `Bearer ${SECRET}`) =>
  cronRoute.GET(
    new Request("http://test/api/cron/daily", { headers: { authorization } }),
  );

/** Puts a nomination straight in the database, so the monthly limit doesn't apply. */
const nominate = async (
  userId: string,
  tmdbId: number,
  extra: Partial<typeof nominations.$inferInsert> = {},
) => {
  const [movie] = await db
    .insert(movies)
    .values({
      tmdbId,
      details: { title: `Movie ${tmdbId}` },
      ratings: { services: [], raw: {} },
    })
    .returning({ id: movies.id });
  const [nomination] = await db
    .insert(nominations)
    .values({ theatreId: CLUB, userId, movieId: movie.id, ...extra })
    .returning();
  return nomination;
};

/** Runs the notifications scheduled after each response, then lists what was sent to whom. */
const sent = async () => {
  for (const task of state.tasks.splice(0)) await task();
  const pushes = vi
    .mocked(webpush.sendNotification)
    .mock.calls.map(([target, payload]) => ({
      to: target.endpoint.slice(DEVICE.length),
      ...(JSON.parse(payload as string) as { title: string; body: string }),
    }))
    .sort((a, b) => a.to.localeCompare(b.to));
  vi.mocked(webpush.sendNotification).mockClear();
  return pushes;
};
const sentTo = async () => map(({ to, body }) => ({ to, body }))(await sent());

beforeEach(async () => {
  const created = await createTestDb();
  db = created.db;
  close = () => created.client.close();
  setDbForTesting(() => db as unknown as DB);
  state.userId = "";
  state.tasks = [];
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "test-public-key");
  vi.stubEnv("VAPID_PRIVATE_KEY", "test-private-key");
  vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.mocked(webpush.sendNotification)
    .mockReset()
    .mockResolvedValue({ statusCode: 201, body: "", headers: {} });

  const people = [OWNER, ALICE, BOB];
  await db.insert(authUsers).values([
    { id: OWNER, name: "Owner", email: "owner@example.com" },
    { id: ALICE, name: "Alice", email: "alice@example.com" },
    { id: BOB, name: "Bob", email: "bob@example.com" },
  ]);
  await db.insert(theatres).values([
    {
      id: CLUB,
      name: "Club",
      createdBy: OWNER,
      inviteCode: "club-code",
      adminInviteCode: "club-admin",
    },
    {
      id: PLAIN,
      name: "Plain",
      createdBy: OWNER,
      inviteCode: "plain-code",
      adminInviteCode: "plain-admin",
    },
  ]);
  await updateTheatre(CLUB, { description: "Friday picks #movieclub" });
  await db.insert(theatreMembers).values([
    ...people.map((userId) => ({
      theatreId: CLUB,
      userId,
      role: userId === OWNER ? ("admin" as const) : ("member" as const),
    })),
    ...people.map((userId) => ({ theatreId: PLAIN, userId })),
  ]);
  await db.insert(subscriptions).values(
    people.map((userId) => ({
      endpoint: `${DEVICE}${userId}`,
      userId,
      p256dh: "key",
      auth: "auth",
    })),
  );
  await db
    .insert(notifications)
    .values([
      ...people.map((userId) => ({ theatreId: CLUB, userId })),
      ...people.map((userId) => ({ theatreId: PLAIN, userId })),
    ]);
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setDbForTesting(null);
  await close();
});

describe("movie club lead notifications", () => {
  it("tells a nominator once when their movie moves into the lead", async () => {
    const owners = await nominate(OWNER, 1);
    await nominate(ALICE, 2);

    asUser(BOB);
    await vote("vote", owners.id);
    expect(await sent()).toEqual([
      {
        to: OWNER,
        title: "Club",
        body: "Your pick, Movie 1, moved into the lead with 1 vote!",
        url: expect.any(String),
        tag: `movieclub-lead-${owners.id}`,
      },
    ]);

    await vote("vote", owners.id);
    expect(await sent()).toEqual([]);
  });

  it("derives the old lead from votes without saving a leader", async () => {
    const owners = await nominate(OWNER, 1);
    const alices = await nominate(ALICE, 2);
    const cycle = cycleOf(new Date());
    await db
      .update(theatres)
      .set({
        extensions: {
          movieclub: { votes: { [cycle]: { [BOB]: [owners.id] } } },
        },
      })
      .where(eq(theatres.id, CLUB));

    asUser(BOB);
    expect((await vote("vote", alices.id)).status).toBe(200);
    expect(await sentTo()).toEqual([
      {
        to: ALICE,
        body: "Your pick, Movie 2, is now tied for the lead with 1 vote!",
      },
    ]);

    const [saved] = await db
      .select({ extensions: theatres.extensions })
      .from(theatres)
      .where(eq(theatres.id, CLUB));
    expect(saved.extensions).toEqual({
      movieclub: { votes: { [cycle]: { [BOB]: [owners.id, alices.id] } } },
    });
  });

  it("tells a nominator when their movie ties for the lead, but not when it pulls ahead", async () => {
    const owners = await nominate(OWNER, 1);
    const alices = await nominate(ALICE, 2);
    asUser(BOB);
    await vote("vote", owners.id);
    await sent();

    asUser(OWNER);
    await vote("vote", alices.id);
    expect(await sentTo()).toEqual([
      {
        to: ALICE,
        body: "Your pick, Movie 2, is now tied for the lead with 1 vote!",
      },
    ]);

    asUser(BOB);
    await vote("vote", alices.id);
    expect(await sent()).toEqual([]);
  });

  it("doesn't tell members about a lead they caused", async () => {
    const owners = await nominate(OWNER, 1);
    const alices = await nominate(ALICE, 2);
    asUser(ALICE);
    await vote("vote", owners.id);
    await vote("vote", owners.id);
    asUser(BOB);
    await vote("vote", alices.id);
    await sent();

    asUser(ALICE);
    await vote("unvote", owners.id);
    expect(await sent()).toEqual([]);
  });

  it("tells a nominator when a removed vote brings their movie back into the lead", async () => {
    const owners = await nominate(OWNER, 1);
    const alices = await nominate(ALICE, 2);
    asUser(BOB);
    await vote("vote", owners.id);
    await vote("vote", alices.id);
    await vote("vote", alices.id);
    await sent();

    await vote("unvote", alices.id);
    expect(await sentTo()).toEqual([
      {
        to: OWNER,
        body: "Your pick, Movie 1, is now tied for the lead with 1 vote!",
      },
    ]);
  });

  it.each([
    ["removed", removeNomination, 204],
    [
      "marked watched",
      (id: number) => setWatched(id, new Date().toISOString()),
      204,
    ],
  ])(
    "tells the next nominator when the leader is %s",
    async (_, change, status) => {
      const owners = await nominate(OWNER, 1);
      const alices = await nominate(ALICE, 2);
      asUser(BOB);
      await vote("vote", owners.id);
      await vote("vote", owners.id);
      await vote("vote", alices.id);
      await sent();

      asUser(OWNER);
      expect((await change(owners.id)).status).toBe(status);
      expect(await sentTo()).toEqual([
        {
          to: ALICE,
          body: "Your pick, Movie 2, moved into the lead with 1 vote!",
        },
      ]);
    },
  );

  it("notifies when a watched leader is reopened, but not when it stays open", async () => {
    const owners = await nominate(OWNER, 1);
    const alices = await nominate(ALICE, 2);
    asUser(BOB);
    await vote("vote", owners.id);
    await vote("vote", alices.id);
    await vote("vote", alices.id);
    await sent();

    asUser(OWNER);
    expect((await setWatched(alices.id, new Date().toISOString())).status).toBe(
      204,
    );
    expect(await sent()).toEqual([]);

    expect((await setWatched(alices.id, null)).status).toBe(204);
    expect(await sentTo()).toEqual([
      {
        to: ALICE,
        body: "Your pick, Movie 2, moved into the lead with 2 votes!",
      },
    ]);

    expect((await setWatched(alices.id, null)).status).toBe(204);
    expect(await sent()).toEqual([]);
  });

  it("starts the lead over each month", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime("2026-03-15T12:00:00Z");
    const owners = await nominate(OWNER, 1);
    asUser(BOB);
    await vote("vote", owners.id);
    expect(await sentTo()).toHaveLength(1);

    vi.setSystemTime("2026-04-02T12:00:00Z");
    await vote("vote", owners.id);
    expect(await sentTo()).toEqual([
      {
        to: OWNER,
        body: "Your pick, Movie 1, moved into the lead with 1 vote!",
      },
    ]);
  });

  it("skips members who turned lead notifications off", async () => {
    asUser(OWNER);
    const settings = await (
      await choose({ extensions: { movieclub: { lead: false } } })
    ).json();
    expect(settings).toMatchObject({
      enabled: true,
      newMovies: true,
      extensions: { movieclub: { lead: false, reminder: true } },
    });

    const owners = await nominate(OWNER, 1);
    asUser(BOB);
    await vote("vote", owners.id);
    expect(await sent()).toEqual([]);
  });
});

describe("movie club nomination reminders", () => {
  // 6pm Pacific on October 30th, the day before nominations close.
  const EVENING_BEFORE = "2026-10-31T01:00:00Z";

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  it("reminds members who haven't nominated this month without saving a send marker", async () => {
    vi.setSystemTime(EVENING_BEFORE);
    await nominate(OWNER, 1, { createdAt: new Date("2026-10-02T12:00:00Z") });
    await nominate(ALICE, 2, { createdAt: new Date("2026-09-20T12:00:00Z") });
    await nominate(BOB, 3, {
      createdAt: new Date("2026-10-03T12:00:00Z"),
      completedAt: new Date("2026-10-10T12:00:00Z"),
    });

    expect((await runDaily()).status).toBe(204);
    const reminder =
      "You haven't nominated a movie this month. Tomorrow is the last day.";
    const reminders = [ALICE, BOB].map((to) => ({
      to,
      title: "Club",
      body: reminder,
      url: expect.any(String),
      tag: "movieclub-reminder-2026-10",
    }));
    expect(await sent()).toEqual(reminders);

    await runDaily();
    expect(await sent()).toEqual(reminders);

    const [saved] = await db
      .select({ extensions: theatres.extensions })
      .from(theatres)
      .where(eq(theatres.id, CLUB));
    expect(saved.extensions).toEqual({});
  });

  it.each([
    ["two days before", "2026-10-30T01:00:00Z"],
    ["on the last day", "2026-11-01T01:00:00Z"],
  ])("doesn't remind anyone %s", async (_, now) => {
    vi.setSystemTime(now);
    await runDaily();
    expect(await sent()).toEqual([]);
  });

  it("skips members who turned reminders off", async () => {
    asUser(ALICE);
    await choose({ extensions: { movieclub: { reminder: false } } });
    vi.setSystemTime(EVENING_BEFORE);
    await runDaily();
    expect(map("to")(await sent())).toEqual([OWNER, BOB]);
  });

  it.each([
    ["without a secret", undefined, "Bearer ", 503],
    ["without a header", SECRET, "", 401],
    ["with the wrong secret", SECRET, "Bearer nope", 401],
  ])("refuses to run %s", async (_, secret, authorization, status) => {
    vi.stubEnv("CRON_SECRET", secret);
    vi.setSystemTime(EVENING_BEFORE);
    expect((await runDaily(authorization)).status).toBe(status);
    expect(await sent()).toEqual([]);
  });
});
