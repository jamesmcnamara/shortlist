import { describe, expect, it } from "vitest";
import { theatreUrl } from "./payload";

describe("theatre notification URLs", () => {
  const id = "44444444-4444-4444-4444-444444444444";

  it.each(["/theatres", "/rooms"])("rejects removed %s links", (prefix) => {
    expect(theatreUrl.safeParse(`${prefix}/${id}`).success).toBe(false);
  });
  it.each(["/u/@alice/movie-club", "/u/@alice-2/watchlist"])(
    "accepts named links: %s",
    (path) => {
      expect(theatreUrl.safeParse(path).success).toBe(true);
    },
  );

  it.each([
    "/",
    "/theatres/not-a-uuid",
    `/theatres/${id}/settings`,
    "/u/@alice/club/settings",
    "/u/@alice/../club",
    "//evil.example/u/@alice/club",
    "/u/@alice/club?next=evil",
    "/u/@a/club",
  ])("rejects invalid links: %s", (path) => {
    expect(theatreUrl.safeParse(path).success).toBe(false);
  });
});
