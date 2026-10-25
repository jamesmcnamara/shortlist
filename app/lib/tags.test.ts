import { describe, expect, it } from "vitest";
import { extractTags } from "./tags";

describe("extractTags", () => {
  it.each([
    ["", []],
    ["Films for #Date_Night and #sci-fi.", ["date_night", "sci-fi"]],
    ["#SciFi #scifi #SCIFI", ["scifi"]],
    ["#2026 #123", ["123", "2026"]],
    ["#horror\n#comedy\t#drama", ["comedy", "drama", "horror"]],
    ['(#horror), [#comedy] {#drama} "#thriller"', ["comedy", "drama", "horror", "thriller"]],
    ["# Heading\n## Another heading\n# #\n###", []],
    ["https://example.com/#fragment https://example.com/movie#scene word#tag", []],
    ["#science fiction", ["science"]],
    ["#Caf\u00e9 #Cafe\u0301 #\u6620\u753b", ["caf\u00e9", "\u6620\u753b"]],
    ["#\u0301invalid", []],
    ["#one,#two ##three", ["one"]],
  ])("extracts tags from %j", (description, expected) => {
    expect(extractTags(description)).toEqual(expected);
  });
});
