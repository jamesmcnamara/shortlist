import { beforeEach, describe, expect, it, vi } from "vitest";
import { listRoomsWithPosterPreviewsForUser } from "@/app/lib/load-room";
import { authUsers } from "@/src/db/neon-auth-schema";
import { setDbForTesting, type DB } from "@/src/db/client";
import { createTestDb } from "@/src/db/test-db";
import { movies, nominations, roomMembers, rooms } from "@/src/db/schema";

vi.mock("@/lib/auth/require-user", () => ({
  requireUserId: vi.fn(),
}));

const USER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_USER_ID = "22222222-2222-2222-2222-222222222222";

let db: Awaited<ReturnType<typeof createTestDb>>["db"];

beforeEach(async () => {
  ({ db } = await createTestDb());
  setDbForTesting(() => db as unknown as DB);

  await db.insert(authUsers).values([
    { id: USER_ID, name: "User", email: "user@example.com" },
    { id: OTHER_USER_ID, name: "Other", email: "other@example.com" },
  ]);
});

describe("listRoomsWithPosterPreviewsForUser", () => {
  it("returns up to three recent posters from each room the user belongs to", async () => {
    const [firstRoom, secondRoom, otherRoom] = await db
      .insert(rooms)
      .values([
        {
          slug: "first",
          name: "First",
          createdBy: USER_ID,
          inviteCode: "first-member",
          adminInviteCode: "first-admin",
        },
        {
          slug: "second",
          name: "Second",
          createdBy: USER_ID,
          inviteCode: "second-member",
          adminInviteCode: "second-admin",
        },
        {
          slug: "other",
          name: "Other",
          createdBy: OTHER_USER_ID,
          inviteCode: "other-member",
          adminInviteCode: "other-admin",
        },
      ])
      .returning();

    await db.insert(roomMembers).values([
      { roomId: firstRoom.id, userId: USER_ID },
      { roomId: secondRoom.id, userId: USER_ID },
      { roomId: otherRoom.id, userId: OTHER_USER_ID },
    ]);

    const insertedMovies = await db
      .insert(movies)
      .values([
        { details: { title: "One", posterUrl: "/one.jpg" }, ratings: {} },
        { details: { title: "Two", posterUrl: "/two.jpg" }, ratings: {} },
        { details: { title: "Three", posterUrl: "/three.jpg" }, ratings: {} },
        { details: { title: "Four", posterUrl: "/four.jpg" }, ratings: {} },
        { details: { title: "No poster" }, ratings: {} },
        { details: { title: "Other", posterUrl: "/other.jpg" }, ratings: {} },
      ])
      .returning();

    await db.insert(nominations).values([
      {
        roomId: firstRoom.id,
        userId: USER_ID,
        movieId: insertedMovies[0].id,
        cycle: 0,
        createdAt: new Date("2026-01-01"),
      },
      {
        roomId: firstRoom.id,
        userId: USER_ID,
        movieId: insertedMovies[1].id,
        cycle: 0,
        createdAt: new Date("2026-01-02"),
      },
      {
        roomId: firstRoom.id,
        userId: USER_ID,
        movieId: insertedMovies[2].id,
        cycle: 0,
        createdAt: new Date("2026-01-03"),
      },
      {
        roomId: firstRoom.id,
        userId: USER_ID,
        movieId: insertedMovies[3].id,
        cycle: 0,
        createdAt: new Date("2026-01-04"),
      },
      {
        roomId: secondRoom.id,
        userId: USER_ID,
        movieId: insertedMovies[4].id,
        cycle: 0,
      },
      {
        roomId: otherRoom.id,
        userId: OTHER_USER_ID,
        movieId: insertedMovies[5].id,
        cycle: 0,
      },
    ]);

    const result = await listRoomsWithPosterPreviewsForUser(USER_ID);
    const bySlug = Object.fromEntries(
      result.map(({ slug, posterUrls }) => [slug, posterUrls]),
    );

    expect(bySlug).toEqual({
      second: [],
      first: ["/four.jpg", "/three.jpg", "/two.jpg"],
    });
  });
});
