// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { createCacheProvider } from "./cache-provider";

const CACHE_KEY = "shortlist:swr-cache";
const aliceKey = `${CACHE_KEY}:alice`;

describe("persistent SWR cache provider", () => {
  beforeEach(() => localStorage.clear());

  it("restores cached data after creating a new provider", () => {
    const firstCache = createCacheProvider("alice");
    firstCache.set("/api/theatres", { data: [{ id: "theatre-1" }] });

    const nextCache = createCacheProvider("alice");

    expect(nextCache.get("/api/theatres")?.data).toEqual([{ id: "theatre-1" }]);
  });

  it("persists only entries with data and removes cleared entries", () => {
    const cache = createCacheProvider("alice");
    cache.set("/api/theatres", { data: [{ id: "theatre-1" }] });
    cache.set("/api/theatres/pending", {});

    expect(JSON.parse(localStorage.getItem(aliceKey) ?? "[]")).toEqual([
      ["/api/theatres", { data: [{ id: "theatre-1" }] }],
    ]);

    cache.delete("/api/theatres");
    expect(JSON.parse(localStorage.getItem(aliceKey) ?? "[]")).toEqual([]);
  });

  it.each(["/api/tmdb/search?query=alien", "/data/oscars.json?v=1"])(
    "keeps %s in memory only",
    (key) => {
      const cache = createCacheProvider("alice");
      cache.set(key, { data: [{ id: 1 }] });

      expect(cache.get(key)?.data).toEqual([{ id: 1 }]);
      expect(JSON.parse(localStorage.getItem(aliceKey) ?? "[]")).toEqual([]);
    },
  );

  it("keeps saving other data when static data outgrows the storage quota", () => {
    const cache = createCacheProvider("alice");
    cache.set("/data/oscars.json?v=1", { data: "x".repeat(5_000_000) });
    cache.set("/api/theatres", { data: [{ id: "theatre-1" }] });

    expect(createCacheProvider("alice").get("/api/theatres")?.data).toEqual([
      { id: "theatre-1" },
    ]);
  });

  it("drops static data saved by older versions", () => {
    localStorage.setItem(
      aliceKey,
      JSON.stringify([
        ["/data/oscars.json", { data: { movies: {} } }],
        ["/api/theatres", { data: [{ id: "theatre-1" }] }],
      ]),
    );

    const cache = createCacheProvider("alice");
    expect(cache.get("/data/oscars.json")).toBeUndefined();

    cache.set("/api/theatres/pending", {});
    expect(JSON.parse(localStorage.getItem(aliceKey) ?? "[]")).toEqual([
      ["/api/theatres", { data: [{ id: "theatre-1" }] }],
    ]);
  });

  it("keeps each user's cache separate", () => {
    createCacheProvider("alice").set("/api/theatres", { data: ["Alice"] });
    createCacheProvider("bob").set("/api/theatres", { data: ["Bob"] });

    expect(createCacheProvider("alice").get("/api/theatres")?.data).toEqual([
      "Alice",
    ]);
    expect(createCacheProvider("bob").get("/api/theatres")?.data).toEqual([
      "Bob",
    ]);
  });
});
