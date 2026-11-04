import { expect, it } from "vitest";
import { toQueryString } from "./search-params";

it("preserves repeated values, key order, empty strings, and URL encoding", () => {
  expect(
    toQueryString({
      tag: ["comedy", "2026"],
      q: "A & B",
      empty: "",
      missing: undefined,
      none: [],
    }),
  ).toBe("tag=comedy&tag=2026&q=A+%26+B&empty=");
});

it("serializes empty parameters without a question mark", () => {
  expect(toQueryString({})).toBe("");
});
