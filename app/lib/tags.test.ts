import { describe, expect, it } from "vitest";
import { extract, split } from "./tags";

describe("split", () => {
  it("keeps original text, whitespace, casing, punctuation, and repeated tags", () => {
    const text = "Spooky (#Horror),\n\t#horror for #2026.";
    const parts = split(text);
    expect(parts).toEqual([
      { type: "text", value: "Spooky (" },
      { type: "tag", value: "#Horror" },
      { type: "text", value: "),\n\t" },
      { type: "tag", value: "#horror" },
      { type: "text", value: " for " },
      { type: "tag", value: "#2026" },
      { type: "text", value: "." },
    ]);
    expect(parts.map(({ value }) => value).join("")).toBe(text);
  });

  it("identifies tags without requiring callers to know their indexes", () => {
    expect(split("#one #two")).toEqual([
      { type: "tag", value: "#one" },
      { type: "text", value: " " },
      { type: "tag", value: "#two" },
    ]);
    expect(split("")).toEqual([]);
    expect(split("No tags.")).toEqual([{ type: "text", value: "No tags." }]);
  });
});

describe("extractTags", () => {
  it.each([
    ["", []],
    ["Films for #Date_Night and #sci-fi.", ["date_night", "sci-fi"]],
    ["#SciFi #scifi #SCIFI", ["scifi"]],
    ["#2026 #123", ["123", "2026"]],
    ["#horror\n#comedy\t#drama", ["comedy", "drama", "horror"]],
    [
      '(#horror), [#comedy] {#drama} "#thriller"',
      ["comedy", "drama", "horror", "thriller"],
    ],
    ["# Heading\n## Another heading\n# #\n###", []],
    [
      "https://example.com/#fragment https://example.com/movie#scene word#tag",
      [],
    ],
    ["#science fiction", ["science"]],
    ["#Caf\u00e9 #Cafe\u0301 #\u6620\u753b", ["caf\u00e9", "\u6620\u753b"]],
    ["#\u0301invalid", []],
    ["#one,#two ##three", ["one"]],
  ])("extracts tags from %j", (description, expected) => {
    expect(extract(description)).toEqual(expected);
  });
});
