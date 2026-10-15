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

  it("keeps movie search results in memory only", () => {
    const cache = createCacheProvider("alice");
    cache.set("/api/tmdb/search?query=alien", { data: [{ id: 1 }] });

    expect(cache.get("/api/tmdb/search?query=alien")?.data).toEqual([
      { id: 1 },
    ]);
    expect(JSON.parse(localStorage.getItem(aliceKey) ?? "[]")).toEqual([]);
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
