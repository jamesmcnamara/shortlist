import { describe, expect, it } from "vitest";
import type { TheatreSummaryWithPosterPreviews } from "./api";
import {
  applyTheatreView,
  parseTheatreView,
  theatreViewParams,
} from "./theatre-view";

const row = (
  id: string,
  name: string,
  createdAt: string,
  updatedAt: string,
  tags: string[],
): TheatreSummaryWithPosterPreviews => ({
  id,
  name,
  createdAt,
  updatedAt,
  tags,
  posterUrls: [],
  role: null,
  watchlistFor: null,
});
const theatres = [
  row("1", "Zombies", "2026-01-01", "2026-03-01", ["horror", "2026"]),
  row("2", "Aliens", "2026-02-01", "2026-02-01", ["scifi", "2026"]),
  row("3", "Halloween", "2026-03-01", "2026-01-01", ["horror"]),
];
const defaults = { query: "", sort: "updated", filters: [] };

describe("theatre directory view", () => {
  it.each([
    ["title", ["2", "3", "1"]],
    ["created", ["3", "2", "1"]],
    ["updated", ["1", "2", "3"]],
  ])("sorts by %s without mutating the source", (sort, expected) => {
    expect(
      applyTheatreView(theatres, { ...defaults, sort }).map(({ id }) => id),
    ).toEqual(expected);
    expect(theatres.map(({ id }) => id)).toEqual(["1", "2", "3"]);
  });

  it("matches titles case-insensitively and combines all tags", () => {
    expect(
      applyTheatreView(theatres, {
        ...defaults,
        query: " ZOM ",
        filters: ["horror", "2026"],
      }).map(({ id }) => id),
    ).toEqual(["1"]);
    expect(
      applyTheatreView(theatres, {
        ...defaults,
        filters: ["horror", "scifi"],
      }),
    ).toEqual([]);
    expect(
      applyTheatreView(theatres, {
        ...defaults,
        filters: ["missing"],
      }),
    ).toEqual([]);
    expect(applyTheatreView(theatres, { ...defaults, query: "scifi" })).toEqual(
      [],
    );
  });

  it("breaks equal dates by name then ID", () => {
    const rows = ["b", "a"].map((id) =>
      row(id, "Same", "2026-01-01", "2026-01-01", []),
    );
    expect(applyTheatreView(rows, defaults).map(({ id }) => id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("normalizes Unicode URL tags and ignores invalid sort/tag values", () => {
    expect(
      parseTheatreView(
        new URLSearchParams(
          "q=Movie&sort=invalid&tag=CAF%C3%89&tag=cafe%CC%81&tag=2026&tag=bad+tag&tag=",
        ),
      ),
    ).toEqual({ query: "Movie", sort: "updated", filters: ["2026", "café"] });
  });

  it("round-trips encoded tags, omits defaults and preserves unrelated params", () => {
    const current = new URLSearchParams("extra=keep&q=old&tag=old&sort=title");
    expect(theatreViewParams(current, defaults).toString()).toBe("extra=keep");
    const next = {
      query: "Date night",
      sort: "created",
      filters: ["café", "2026", "café"],
    };
    const params = theatreViewParams(current, next);
    expect(parseTheatreView(params)).toEqual({
      ...next,
      filters: ["2026", "café"],
    });
    expect(current.get("q")).toBe("old");
  });
});
