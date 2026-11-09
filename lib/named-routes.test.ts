import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/src/db/test-db";
import { setDbForTesting, type DB } from "@/src/db/client";
import { authUsers } from "@/src/db/neon-auth-schema";
import { redirects, theatres } from "@/src/db/schema";
import { findTheatreById } from "@/lib/auth/require-theatre";
import { resolveNamedTheatre, resolveUsernameRedirect } from "./named-routes";

vi.mock("@/lib/auth/require-user", () => ({ requireUserId: vi.fn() }));

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
let fixture: Awaited<ReturnType<typeof createTestDb>>;

beforeEach(async () => {
  fixture = await createTestDb();
  setDbForTesting(() => fixture.db as unknown as DB);
});
afterEach(async () => {
  setDbForTesting(null);
  await fixture.client.close();
});

it("generates unique handles without exposing email addresses", async () => {
  const users = await fixture.db
    .insert(authUsers)
    .values([
      { id: ALICE, name: "Alice", email: "private@example.com" },
      { id: BOB, name: "Alice", email: "other@example.com" },
      {
        id: "33333333-3333-3333-3333-333333333333",
        name: "Alice-2",
        email: "third@example.com",
      },
      {
        id: "44444444-4444-4444-4444-444444444444",
        name: "映画",
        email: "fourth@example.com",
      },
    ])
    .returning();
  expect(users.map(({ username }) => username)).toEqual([
    "alice",
    "alice-2",
    "alice-2-2",
    "user",
  ]);
});

it("normalizes chosen handles and rejects duplicates and invalid handles", async () => {
  await fixture.db.insert(authUsers).values({
    id: ALICE,
    name: "Alice",
    email: "alice@example.com",
    username: "JAMES",
  });
  expect((await fixture.db.select().from(authUsers))[0].username).toBe("james");
  await expect(
    fixture.db.insert(authUsers).values({
      id: BOB,
      name: "Bob",
      email: "bob@example.com",
      username: "james",
    }),
  ).rejects.toThrow();
  await expect(
    fixture.db.insert(authUsers).values({
      id: BOB,
      name: "Bob",
      email: "bob@example.com",
      username: "../bob",
    }),
  ).rejects.toThrow();
});

it("allows handle changes, normalizes them, and synchronizes displayUsername", async () => {
  await fixture.db.insert(authUsers).values({
    id: ALICE,
    name: "Alice",
    email: "alice@example.com",
  });
  const [user] = await fixture.db
    .update(authUsers)
    .set({
      name: "James McNamara",
      username: " MAC-THE-SPORK ",
      displayUsername: "different",
    })
    .where(eq(authUsers.id, ALICE))
    .returning();
  expect(user).toMatchObject({
    name: "James McNamara",
    username: "mac-the-spork",
    displayUsername: "mac-the-spork",
  });
});

it("rejects duplicate and invalid handles on update without changing the user", async () => {
  await fixture.db.insert(authUsers).values([
    { id: ALICE, name: "Alice", email: "alice@example.com" },
    { id: BOB, name: "Bob", email: "bob@example.com" },
  ]);
  await expect(
    fixture.db
      .update(authUsers)
      .set({ username: " BOB " })
      .where(eq(authUsers.id, ALICE)),
  ).rejects.toThrow();
  await expect(
    fixture.db
      .update(authUsers)
      .set({ username: "../alice" })
      .where(eq(authUsers.id, ALICE)),
  ).rejects.toThrow();
  const [user] = await fixture.db
    .select()
    .from(authUsers)
    .where(eq(authUsers.id, ALICE));
  expect(user).toMatchObject({ username: "alice", displayUsername: "alice" });
});

it("uses the new handle for theatre links and supports a manually added redirect", async () => {
  await fixture.db.insert(authUsers).values({
    id: ALICE,
    name: "Alice",
    email: "alice@example.com",
  });
  const [theatre] = await fixture.db
    .insert(theatres)
    .values({
      name: "Movie Club",
      createdBy: ALICE,
      inviteCode: "a",
      adminInviteCode: "aa",
    })
    .returning();
  await fixture.db
    .update(authUsers)
    .set({ username: "mac-the-spork" })
    .where(eq(authUsers.id, ALICE));
  expect(await resolveNamedTheatre("@alice", "movie-club")).toBeNull();
  expect(await resolveUsernameRedirect("@alice")).toBeNull();
  expect(await resolveNamedTheatre("@mac-the-spork", "movie-club")).toEqual({
    id: theatre.id,
  });
  expect(await findTheatreById(theatre.id)).toMatchObject({
    path: "/u/@mac-the-spork/movie-club",
  });
  await fixture.db.insert(redirects).values({
    fromHandle: "alice",
    toHandle: "mac-the-spork",
  });
  expect(await resolveUsernameRedirect("@alice")).toBe("mac-the-spork");
  expect(await resolveUsernameRedirect("@alice", "movie-club")).toBe(
    "mac-the-spork",
  );
});

it("resolves theatres by creator rather than viewer, with stable collision-safe slugs", async () => {
  await fixture.db.insert(authUsers).values([
    { id: ALICE, name: "Alice", email: "alice@example.com" },
    { id: BOB, name: "Bob", email: "bob@example.com" },
  ]);
  const lists = await fixture.db
    .insert(theatres)
    .values([
      {
        name: "Movie Club",
        createdBy: ALICE,
        inviteCode: "a",
        adminInviteCode: "aa",
      },
      {
        name: "Movie Club",
        createdBy: BOB,
        inviteCode: "b",
        adminInviteCode: "bb",
      },
      {
        name: "Movie Club",
        createdBy: ALICE,
        inviteCode: "c",
        adminInviteCode: "cc",
      },
      {
        name: "Movie Club-2",
        createdBy: ALICE,
        inviteCode: "d",
        adminInviteCode: "dd",
      },
    ])
    .returning();
  expect(lists.map(({ slug }) => slug)).toEqual([
    "movie-club",
    "movie-club",
    "movie-club-2",
    "movie-club-2-2",
  ]);
  expect(await resolveNamedTheatre("@alice", "movie-club")).toEqual({
    id: lists[0].id,
  });
  expect(await resolveNamedTheatre("%40alice", "movie-club")).toEqual({
    id: lists[0].id,
  });
  expect(await resolveNamedTheatre("@bob", "movie-club")).toEqual({
    id: lists[1].id,
  });
  expect(await resolveNamedTheatre("@bob", "movie-club-2")).toBeNull();
  await fixture.db
    .update(theatres)
    .set({ name: "Renamed" })
    .where(eq(theatres.id, lists[0].id));
  expect(await findTheatreById(lists[0].id)).toMatchObject({
    name: "Renamed",
    path: "/u/@alice/movie-club",
  });
  await expect(
    fixture.db
      .update(theatres)
      .set({ slug: "renamed" })
      .where(eq(theatres.id, lists[0].id)),
  ).rejects.toThrow();
});

it.each([
  ["alice", "club"],
  ["@../alice", "club"],
  ["@alice", "../club"],
  ["@alice", "club/settings"],
])("rejects malformed named routes %s/%s", async (user, slug) => {
  expect(await resolveNamedTheatre(user, slug)).toBeNull();
});

it("rejects malformed legacy theatre IDs without an invalid UUID query", async () => {
  expect(await findTheatreById("not-a-uuid")).toBeNull();
});

it("resolves a mapped handle only when the replacement user and theatre exist", async () => {
  await fixture.db.insert(authUsers).values({
    id: BOB,
    name: "Bob",
    email: "bob@example.com",
  });
  await fixture.db.insert(theatres).values({
    name: "Movie Club",
    createdBy: BOB,
    inviteCode: "b",
    adminInviteCode: "bb",
  });
  await fixture.db.insert(redirects).values({
    fromHandle: "alice",
    toHandle: "bob",
  });
  expect(await resolveUsernameRedirect("@alice")).toBe("bob");
  expect(await resolveUsernameRedirect("%40ALICE", "movie-club")).toBe("bob");
  expect(await resolveUsernameRedirect("@alice", "missing")).toBeNull();
  expect(await resolveUsernameRedirect("@alice", "../movie-club")).toBeNull();
  expect(await resolveUsernameRedirect("@unknown")).toBeNull();
  expect(await resolveUsernameRedirect("alice")).toBeNull();
  expect(await resolveUsernameRedirect("@../alice")).toBeNull();
});

it("does not follow chains or cycles when the replacement is missing", async () => {
  await fixture.db.insert(authUsers).values({
    id: BOB,
    name: "Bob",
    email: "bob@example.com",
  });
  await fixture.db.insert(redirects).values([
    { fromHandle: "alice", toHandle: "missing" },
    { fromHandle: "missing", toHandle: "bob" },
    { fromHandle: "cycle-one", toHandle: "cycle-two" },
    { fromHandle: "cycle-two", toHandle: "cycle-one" },
  ]);
  expect(await resolveUsernameRedirect("@alice")).toBeNull();
  expect(await resolveUsernameRedirect("@missing")).toBe("bob");
  expect(await resolveUsernameRedirect("@cycle-one")).toBeNull();
});

it("does not follow a theatre redirect cycle even when both handles exist", async () => {
  await fixture.db.insert(authUsers).values([
    { id: ALICE, name: "Alice", email: "alice@example.com" },
    { id: BOB, name: "Bob", email: "bob@example.com" },
  ]);
  await fixture.db.insert(theatres).values({
    name: "Movie Club",
    createdBy: BOB,
    inviteCode: "b",
    adminInviteCode: "bb",
  });
  await fixture.db.insert(redirects).values([
    { fromHandle: "alice", toHandle: "bob" },
    { fromHandle: "bob", toHandle: "alice" },
  ]);
  expect(await resolveNamedTheatre("@alice", "movie-club")).toBeNull();
  expect(await resolveUsernameRedirect("@alice", "movie-club")).toBe("bob");
  expect(await resolveUsernameRedirect("@bob", "movie-club")).toBeNull();
  expect(await resolveUsernameRedirect("@alice", "missing")).toBeNull();
});

it.each([
  { fromHandle: "alice", toHandle: "alice" },
  { fromHandle: "@alice", toHandle: "bob" },
  { fromHandle: "ALICE", toHandle: "bob" },
  { fromHandle: "alice", toHandle: "../bob" },
  { fromHandle: "alice", toHandle: "https://example.com" },
])(
  "rejects invalid redirect mappings $fromHandle -> $toHandle",
  async (mapping) => {
    await expect(
      fixture.db.insert(redirects).values(mapping),
    ).rejects.toThrow();
  },
);
