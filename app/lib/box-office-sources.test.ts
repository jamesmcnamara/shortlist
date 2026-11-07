import { describe, expect, it } from "vitest";
import {
  resolveBoxOffice,
  type BoxOfficeSources,
  type MojoBoxOfficeData,
} from "./box-office";

const mojo: MojoBoxOfficeData = {
  source: "boxofficemojo",
  url: "https://www.boxofficemojo.com/title/tt0816692/",
  fetchedAt: "2026-11-06T00:00:00Z",
  currency: "USD",
  budget: 100,
  domesticGross: 200,
  internationalGross: 300,
  worldwideGross: 500,
};

describe("source-keyed box office resolution", () => {
  it.each([
    [
      {
        manual: { budget: 10 },
        boxofficemojo: mojo,
        tmdb: { budget: 20 },
        wikipedia: { budget: 30, url: null },
      },
      "manual",
      10,
    ],
    [{ boxofficemojo: mojo, tmdb: { budget: 20 } }, "boxofficemojo", 100],
    [
      {
        boxofficemojo: { ...mojo, budget: null },
        tmdb: { budget: 20 },
        wikipedia: { budget: 30, url: null },
      },
      "tmdb",
      20,
    ],
    [
      {
        boxofficemojo: { ...mojo, budget: null },
        wikipedia: { budget: 30, url: null },
      },
      "wikipedia",
      30,
    ],
    [
      { boxofficemojo: { ...mojo, budget: 0 }, tmdb: { budget: 20 } },
      "boxofficemojo",
      0,
    ],
    [{ manual: { budget: 0 }, boxofficemojo: mojo }, "manual", 0],
  ] satisfies [BoxOfficeSources, string, number][])(
    "resolves %j using %s",
    (sources, budgetSource, budget) => {
      expect(resolveBoxOffice(sources)).toMatchObject({ budget, budgetSource });
    },
  );

  it("uses only Mojo grosses and metadata without mutating snapshots", () => {
    const sources = { boxofficemojo: mojo, manual: { budget: 10 } };
    const before = structuredClone(sources);
    expect(resolveBoxOffice(sources)).toEqual({
      ...mojo,
      budget: 10,
      budgetSource: "manual",
    });
    expect(sources).toEqual(before);
  });

  it("doesn't manufacture scraper metadata for a manual budget", () => {
    expect(resolveBoxOffice({ manual: { budget: 10 } })).toEqual({
      source: "manual",
      currency: "USD",
      budget: 10,
      budgetSource: "manual",
      domesticGross: null,
      internationalGross: null,
      worldwideGross: null,
      url: undefined,
      fetchedAt: undefined,
    });
  });

  it("keeps unknown figures unknown", () => {
    expect(resolveBoxOffice({})).toBeUndefined();
    expect(resolveBoxOffice({ tmdb: { budget: null } })).toBeUndefined();
    expect(
      resolveBoxOffice({ boxofficemojo: { ...mojo, budget: null } }),
    ).toMatchObject({ budget: null, worldwideGross: 500 });
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "does not resolve an invalid TMDB budget of %s",
    (budget) => {
      expect(
        resolveBoxOffice({
          tmdb: { budget },
          wikipedia: { budget: 30, url: null },
        }),
      ).toMatchObject({ budget: 30, budgetSource: "wikipedia" });
    },
  );
});
