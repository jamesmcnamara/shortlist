import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import proxy, { config } from "../proxy";

vi.mock("better-auth/cookies", () => ({ getSessionCookie: () => null }));

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
  "/u/@alice",
  "/u/@alice/settings",
  "/u/@alice/club",
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
