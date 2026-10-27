import { createECDH } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import webpush from "web-push";
import { createTestDb, type TestDb } from "@/src/db/test-db";
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
import * as subscriptionsRoute from "@/app/api/push/route";
import * as preferencesRoute from "@/app/api/theatres/[theatreId]/notifications/route";
import { POST as nominate } from "@/app/api/theatres/[theatreId]/nominations/route";
import { pushSubscription, sendNomNotys } from "./push";

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

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const OUTSIDER = "33333333-3333-3333-3333-333333333333";
const THEATRE = "44444444-4444-4444-4444-444444444444";
const OTHER_THEATRE = "55555555-5555-5555-5555-555555555555";
const context = (theatreId = THEATRE) => ({
  params: Promise.resolve({ theatreId }),
});
const request = (body: unknown, method = "POST") =>
  new Request("https://shortlist.test/api", {
    method,
    body: JSON.stringify(body),
  });
const key = createECDH("prime256v1");
key.generateKeys();
const subscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/device-bob",
  keys: {
    p256dh: key.getPublicKey().toString("base64url"),
    auth: Buffer.alloc(16, 1).toString("base64url"),
  },
};

let db: TestDb;
let close: () => Promise<void>;
let movieId: number;

beforeEach(async () => {
  const created = await createTestDb();
  db = created.db;
  close = () => created.client.close();
  setDbForTesting(() => db as unknown as DB);
  state.userId = BOB;
  state.tasks = [];
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", subscription.keys.p256dh);
  vi.stubEnv("VAPID_PRIVATE_KEY", "test-private-key");
  vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");
  vi.mocked(webpush.sendNotification)
    .mockReset()
    .mockResolvedValue({ statusCode: 201, body: "", headers: {} });
  await db.insert(authUsers).values([
    { id: ALICE, name: "Alice", email: "alice@example.com" },
    { id: BOB, name: "Bob", email: "bob@example.com" },
    { id: OUTSIDER, name: "Outsider", email: "outsider@example.com" },
  ]);
  await db.insert(theatres).values([
    {
      id: THEATRE,
      name: "Movie club",
      createdBy: ALICE,
      inviteCode: "a",
      adminInviteCode: "aa",
    },
    {
      id: OTHER_THEATRE,
      name: "Secret",
      createdBy: OUTSIDER,
      inviteCode: "b",
      adminInviteCode: "bb",
    },
  ]);
  await db.insert(theatreMembers).values([
    { theatreId: THEATRE, userId: ALICE, role: "admin" },
    { theatreId: THEATRE, userId: BOB },
    { theatreId: OTHER_THEATRE, userId: OUTSIDER },
  ]);
  const [movie] = await db
    .insert(movies)
    .values({
      tmdbId: 123,
      details: { title: "Arrival" },
      ratings: { services: [], raw: {} },
    })
    .returning();
  movieId = movie.id;
});

afterEach(async () => {
  setDbForTesting(null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await close();
});

async function register() {
  expect((await subscriptionsRoute.POST(request(subscription))).status).toBe(
    204,
  );
  expect(
    (await preferencesRoute.PUT(request({ enabled: true }, "PUT"), context()))
      .status,
  ).toBe(200);
}

async function addMovie() {
  state.userId = ALICE;
  const response = await nominate(request({ movieId }), context());
  expect(response.status).toBe(201);
  return response.json() as Promise<{ id: number }>;
}

describe("push subscriptions and preferences", () => {
  it("defaults off, registers devices idempotently, and allows members to opt in/out", async () => {
    const response = await preferencesRoute.GET(
      new Request("https://test"),
      context(),
    );
    expect(await response.json()).toEqual({ enabled: false, configured: true });
    await register();
    await register();
    expect(await db.select().from(subscriptions)).toHaveLength(1);
    expect(await db.select().from(notifications)).toHaveLength(1);
    await preferencesRoute.PUT(request({ enabled: false }, "PUT"), context());
    expect(await db.select().from(notifications)).toHaveLength(0);
  });

  it("rejects unauthenticated subscriptions and cross-theatre preferences", async () => {
    state.userId = "";
    expect((await subscriptionsRoute.POST(request(subscription))).status).toBe(
      401,
    );
    state.userId = BOB;
    expect(
      (
        await preferencesRoute.GET(
          new Request("https://test"),
          context(OTHER_THEATRE),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await preferencesRoute.PUT(
          request({ enabled: true }, "PUT"),
          context(OTHER_THEATRE),
        )
      ).status,
    ).toBe(404);
    expect(await db.select().from(notifications)).toHaveLength(0);
  });

  it("does not transfer or delete another account's subscription", async () => {
    await register();
    state.userId = ALICE;
    expect((await subscriptionsRoute.POST(request(subscription))).status).toBe(
      409,
    );
    await subscriptionsRoute.DELETE(
      request({ endpoint: subscription.endpoint }, "DELETE"),
    );
    expect((await db.select().from(subscriptions))[0].userId).toBe(BOB);
    state.userId = BOB;
    await subscriptionsRoute.DELETE(
      request({ endpoint: subscription.endpoint }, "DELETE"),
    );
    expect(await db.select().from(subscriptions)).toHaveLength(0);
  });

  it("cascades preferences on removal and does not restore opt-in when rejoining", async () => {
    await register();
    await db.delete(theatreMembers).where(eq(theatreMembers.userId, BOB));
    expect(await db.select().from(notifications)).toHaveLength(0);
    await db.insert(theatreMembers).values({ theatreId: THEATRE, userId: BOB });
    expect(await db.select().from(notifications)).toHaveLength(0);
  });

  it("reports missing configuration and malformed settings", async () => {
    expect(
      (
        await preferencesRoute.PUT(
          request({ enabled: "yes" }, "PUT"),
          context(),
        )
      ).status,
    ).toBe(400);
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    expect((await subscriptionsRoute.POST(request(subscription))).status).toBe(
      503,
    );
    expect(
      (await preferencesRoute.PUT(request({ enabled: true }, "PUT"), context()))
        .status,
    ).toBe(503);
    await addMovie();
    expect(state.tasks).toHaveLength(0);
  });

  it.each([
    "http://fcm.googleapis.com/fcm/send/test",
    "https://127.0.0.1/push",
    "https://example.com/push",
    "https://fcm.googleapis.com.evil.test/push",
    "https://user:password@fcm.googleapis.com/push",
    "https://fcm.googleapis.com:444/push",
  ])("rejects unsafe endpoint %s", async (endpoint) => {
    expect(
      (await subscriptionsRoute.POST(request({ ...subscription, endpoint })))
        .status,
    ).toBe(400);
  });

  it("validates encryption keys", async () => {
    expect(pushSubscription.parse(subscription)).toEqual(subscription);
    for (const keys of [
      { ...subscription.keys, auth: "invalid" },
      { ...subscription.keys, p256dh: Buffer.alloc(65).toString("base64url") },
    ]) {
      expect(
        (await subscriptionsRoute.POST(request({ ...subscription, keys })))
          .status,
      ).toBe(400);
    }
  });
});

describe("best-effort delivery", () => {
  it("sends after responding, excludes the actor, and deep-links to the authorized list", async () => {
    await register();
    state.userId = ALICE;
    await subscriptionsRoute.POST(
      request({
        ...subscription,
        endpoint: "https://fcm.googleapis.com/fcm/send/alice",
      }),
    );
    await preferencesRoute.PUT(request({ enabled: true }, "PUT"), context());
    await addMovie();
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect(state.tasks).toHaveLength(1);
    await state.tasks[0]();
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    const [target, payload, options] = vi.mocked(webpush.sendNotification).mock
      .calls[0];
    expect(target).toEqual(subscription);
    expect(JSON.parse(payload as string)).toMatchObject({
      title: "Movie club",
      body: "Arrival was added to the list.",
      url: `/theatres/${THEATRE}`,
    });
    expect(options).toMatchObject({ timeout: 5000, TTL: 3600 });
  });

  it.each(["opt-out", "removed-member", "removed-device"] as const)(
    "rechecks %s after the movie is saved",
    async (change) => {
      await register();
      await addMovie();
      if (change === "opt-out") await db.delete(notifications);
      if (change === "removed-member")
        await db.delete(theatreMembers).where(eq(theatreMembers.userId, BOB));
      if (change === "removed-device") await db.delete(subscriptions);
      await state.tasks[0]();
      expect(webpush.sendNotification).not.toHaveBeenCalled();
    },
  );

  it("does not send a nomination from a different theatre", async () => {
    await register();
    const added = await addMovie();
    await sendNomNotys(OTHER_THEATRE, added.id);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it.each([404, 410])("removes expired subscriptions on %s", async (status) => {
    await register();
    await addMovie();
    vi.mocked(webpush.sendNotification).mockRejectedValue(
      new webpush.WebPushError("Gone", status, {}, "", subscription.endpoint),
    );
    await state.tasks[0]();
    expect(await db.select().from(subscriptions)).toHaveLength(0);
  });

  it("logs other failures safely, preserves subscriptions, and does not retry", async () => {
    await register();
    await addMovie();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(webpush.sendNotification).mockRejectedValue(
      new webpush.WebPushError(
        "Secret endpoint",
        503,
        {},
        "secret",
        subscription.endpoint,
      ),
    );
    await state.tasks[0]();
    expect(log).toHaveBeenCalledWith("Movie notification delivery failed", {
      status: 503,
    });
    expect(await db.select().from(subscriptions)).toHaveLength(1);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    expect(await db.select().from(nominations)).toHaveLength(1);
  });
});
