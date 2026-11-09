import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import proxy, { config } from "../proxy";

const session = vi.hoisted(() => ({
  cookie: vi.fn((): string | null => null),
}));
vi.mock("better-auth/cookies", () => ({ getSessionCookie: session.cookie }));

it.each([
  "/",
  "/theatres/new",
  "/u/@alice/club/settings",
  "/u/@alice/settings/settings",
])("protects active private route %s", (url) => {
  expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
  const response = proxy(new NextRequest(`http://localhost${url}`));
  const destination = new URL(response.headers.get("location")!);
  expect(destination.pathname).toBe("/auth/sign-in");
  expect(destination.searchParams.get("next")).toBe(url);
});

it.each([
  "/m/42",
  "/theatres",
  "/theatres/11111111-1111-1111-1111-111111111111",
  "/rooms/club",
  "/r/club",
  "/api/rooms/club",
  "/join/code",
])("does not intercept public or removed route %s", (url) => {
  expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
});

it.each(["/u/@alice", "/u/@alice/settings", "/u/@alice/club"])(
  "forwards public user route %s without requiring sign-in",
  (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
    const response = proxy(
      new NextRequest(`http://localhost${url}?tag=comedy&tag=drama`, {
        headers: { "x-shortlist-user-route": "/u/@spoofed" },
      }),
    );
    expect(response.headers.get("location")).toBeNull();
    expect(
      response.headers.get("x-middleware-request-x-shortlist-user-route"),
    ).toBe(`${url}?tag=comedy&tag=drama`);
  },
);

it("forwards the settings path and query for a signed-in visitor", () => {
  session.cookie.mockReturnValueOnce("session");
  const response = proxy(
    new NextRequest("http://localhost/u/@alice/club/settings?tab=members"),
  );
  expect(response.headers.get("location")).toBeNull();
  expect(
    response.headers.get("x-middleware-request-x-shortlist-user-route"),
  ).toBe("/u/@alice/club/settings?tab=members");
});
