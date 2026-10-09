import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listRoomsWithPosterPreviewsForUser,
  MAX_POSTER_PREVIEWS,
} from "@/app/lib/load-room";
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
  it("returns the most recent posters, up to the cap, from each room the user belongs to", async () => {
    const [firstRoom, secondRoom, otherRoom] = await db
      .insert(rooms)
      .values([
        {
          name: "First",
          createdBy: USER_ID,
          inviteCode: "first-member",
          adminInviteCode: "first-admin",
        },
        {
          name: "Second",
          createdBy: USER_ID,
          inviteCode: "second-member",
          adminInviteCode: "second-admin",
        },
        {
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

    const posterCount = MAX_POSTER_PREVIEWS + 1;
    const posterMovies = await db
      .insert(movies)
      .values(
        Array.from({ length: posterCount }, (_, i) => ({
          details: { title: `Movie ${i}`, posterUrl: `/${i}.jpg` },
          ratings: {},
        })),
      )
      .returning();
    const [noPosterMovie, otherMovie] = await db
      .insert(movies)
      .values([
        { details: { title: "No poster" }, ratings: {} },
        { details: { title: "Other", posterUrl: "/other.jpg" }, ratings: {} },
      ])
      .returning();

    await db.insert(nominations).values([
      ...posterMovies.map((movie, i) => ({
        roomId: firstRoom.id,
        userId: USER_ID,
        movieId: movie.id,
        createdAt: new Date(Date.UTC(2026, 0, i + 1)),
      })),
      {
        roomId: secondRoom.id,
        userId: USER_ID,
        movieId: noPosterMovie.id,
      },
      {
        roomId: otherRoom.id,
        userId: OTHER_USER_ID,
        movieId: otherMovie.id,
      },
    ]);

    const result = await listRoomsWithPosterPreviewsForUser(USER_ID);
    const postersByRoomId = Object.fromEntries(
      result.map(({ id, posterUrls }) => [id, posterUrls]),
    );

    expect(postersByRoomId).toEqual({
      [secondRoom.id]: [],
      [firstRoom.id]: Array.from(
        { length: MAX_POSTER_PREVIEWS },
        (_, i) => `/${posterCount - 1 - i}.jpg`,
      ),
    });
  });
});
