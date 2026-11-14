import { describe, expect, it } from "vitest";
import { hasExtension, isExtension } from ".";

describe("isExtension", () => {
  it.each([
    ["specific", true],
    ["movieclub", true],
    ["movie-club", false],
    ["SPECIFIC", false],
    [" specific", false],
    ["nope", false],
    ["", false],
    ["__proto__", false],
    ["constructor", false],
    ["toString", false],
  ])("is %j -> %s", (name, expected) => {
    expect(isExtension(name)).toBe(expected);
  });
});

describe("hasExtension", () => {
  it.each([
    ["Heist films #specific", true],
    ["#SPECIFIC", true],
    ["(#specific) and #horror", true],
    ["#specifically wrong", false],
    ["specific, but no tag", false],
    ["https://example.com/#specific", false],
    ["", false],
    [null, false],
    [undefined, false],
  ])("finds #specific in %j -> %s", (description, expected) => {
    expect(hasExtension("specific", description)).toBe(expected);
  });
});

describe("hasExtension aliases", () => {
  it.each([
    ["Our #movieclub", true],
    ["Our #movie-club", true],
    ["Our #Movie-Club!", true],
    ["#movie-clubs", false],
    ["#movie_club", false],
    ["#movie club", false],
    ["movie-club, but no tag", false],
    ["https://example.com/#movie-club", false],
  ])("finds #movieclub in %j -> %s", (description, expected) => {
    expect(hasExtension("movieclub", description)).toBe(expected);
  });

  it("only treats an alias as its own extension's tag", () => {
    expect(hasExtension("specific", "#movie-club")).toBe(false);
  });
});
