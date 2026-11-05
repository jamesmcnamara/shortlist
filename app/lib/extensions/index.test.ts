import { describe, expect, it } from "vitest";
import { hasExtension, isExtension } from ".";

describe("isExtension", () => {
  it.each([
    ["specific", true],
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
