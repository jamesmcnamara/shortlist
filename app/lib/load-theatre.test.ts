import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listPublicTheatres,
  listPublicTheatresWithPosterPreviews,
  MAX_POSTER_PREVIEWS,
} from "@/app/lib/load-theatre";
import { authUsers } from "@/src/db/neon-auth-schema";
import { setDbForTesting, type DB } from "@/src/db/client";
import { createTestDb } from "@/src/db/test-db";
import { movies, nominations, tags, theatreMembers, theatres, theatreTags } from "@/src/db/schema";

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

describe("listPublicTheatresWithPosterPreviews", () => {
  it("scopes public posters to a user's theatres and roles to the viewer", async () => {
    const [firstTheatre, secondTheatre, otherTheatre] = await db
      .insert(theatres)
      .values([
        {
          name: "First",
          createdBy: USER_ID,
          watchlistFor: USER_ID,
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
          watchlistFor: OTHER_USER_ID,
          inviteCode: "other-member",
          adminInviteCode: "other-admin",
        },
      ])
      .returning();

    await db.insert(theatreMembers).values([
      { theatreId: firstTheatre.id, userId: USER_ID },
      { theatreId: secondTheatre.id, userId: USER_ID },
      { theatreId: secondTheatre.id, userId: OTHER_USER_ID },
      { theatreId: otherTheatre.id, userId: OTHER_USER_ID },
    ]);
    await db.insert(tags).values([
      { name: "horror" }, { name: "2026" }, { name: "unused" }, { name: "other" },
    ]);
    await db.insert(theatreTags).values([
      { theatreId: firstTheatre.id, tag: "horror" },
      { theatreId: firstTheatre.id, tag: "2026" },
      { theatreId: otherTheatre.id, tag: "other" },
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
        theatreId: firstTheatre.id,
        userId: USER_ID,
        movieId: movie.id,
        createdAt: new Date(Date.UTC(2026, 0, i + 1)),
      })),
      {
        theatreId: secondTheatre.id,
        userId: USER_ID,
        movieId: noPosterMovie.id,
      },
      {
        theatreId: otherTheatre.id,
        userId: OTHER_USER_ID,
        movieId: otherMovie.id,
      },
    ]);

    const result = await listPublicTheatresWithPosterPreviews(USER_ID);
    expect(result.find(({ id }) => id === firstTheatre.id)?.tags).toEqual(["2026", "horror"]);
    expect(result.find(({ id }) => id === secondTheatre.id)?.tags).toEqual([]);
    expect(result.every((theatre) =>
      typeof theatre.createdAt === "string" && typeof theatre.updatedAt === "string"
      && !("inviteCode" in theatre) && !("adminInviteCode" in theatre),
    )).toBe(true);
    const publicResult = await listPublicTheatresWithPosterPreviews(USER_ID, null);
    expect(publicResult.every(({ role }) => role === null)).toBe(true);
    expect(publicResult.flatMap(({ tags }) => tags)).toEqual(["2026", "horror"]);
    const postersByTheatreId = Object.fromEntries(
      result.map(({ id, posterUrls }) => [id, posterUrls]),
    );

    expect(postersByTheatreId).toEqual({
      [secondTheatre.id]: [],
      [firstTheatre.id]: Array.from(
        { length: MAX_POSTER_PREVIEWS },
        (_, i) => `/${posterCount - 1 - i}.jpg`,
      ),
    });

    const anonymous = await listPublicTheatres(USER_ID, null);
    expect(anonymous).toHaveLength(2);
    expect(anonymous.every(({ role }) => !role))
      .toBe(true);
    expect(
      anonymous.find(({ id }) => id === firstTheatre.id),
    ).toMatchObject({ watchlistFor: USER_ID, role: null });
    const viewerLists = await listPublicTheatres(OTHER_USER_ID, USER_ID);
    expect(viewerLists).toHaveLength(2);
    expect(
      viewerLists.find(({ id }) => id === secondTheatre.id),
    ).toMatchObject({ watchlistFor: null, role: "member" });
    expect(
      viewerLists.find(({ id }) => id === otherTheatre.id),
    ).toMatchObject({ watchlistFor: OTHER_USER_ID, role: null });
  });
});
