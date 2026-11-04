import { expect, it } from "vitest";
import { isUserTheatresPath } from "./user-path";

it.each(["/u/@alice", "/u/@bob/", "/u/%40alice"])(
  "recognizes a user theatres path: %s",
  (pathname) => {
    expect(isUserTheatresPath(pathname)).toBe(true);
  },
);

it.each(["/", "/u/", "/u/@alice/club", "/u/@alice/club/settings", "/m/42"])(
  "does not match other page paths: %s",
  (pathname) => {
    expect(isUserTheatresPath(pathname)).toBe(false);
  },
);
