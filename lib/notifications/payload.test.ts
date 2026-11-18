import { describe, expect, it } from "vitest";
import { notificationPayload, theatreUrl } from "./payload";

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
    "/u/@alice/club?nominationId=1",
    "/u/@alice/club?nominationId=1&next=evil",
    "/u/@a/club",
  ])("rejects invalid links: %s", (path) => {
    expect(theatreUrl.safeParse(path).success).toBe(false);
  });

  describe("notification nomination IDs", () => {
    const payload = {
      title: "Movies",
      body: "Arrival was added.",
      url: "/u/@alice/movie-club",
    };

    it("accepts older notifications without an ID", () => {
      expect(notificationPayload.safeParse(payload).success).toBe(true);
    });

    it.each([1, 2147483647])("accepts %s", (nominationId) => {
      expect(
        notificationPayload.safeParse({ ...payload, nominationId }).success,
      ).toBe(true);
    });

    it.each([0, -1, 1.5, 2147483648, "1"])(
      "rejects invalid ID %s",
      (nominationId) => {
        expect(
          notificationPayload.safeParse({ ...payload, nominationId }).success,
        ).toBe(false);
      },
    );
  });
});
