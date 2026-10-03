// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { createCacheProvider } from "./cache-provider";

const CACHE_KEY = "shortlist:swr-cache";
const aliceKey = `${CACHE_KEY}:alice`;

describe("persistent SWR cache provider", () => {
  beforeEach(() => localStorage.clear());

  it("restores cached data after creating a new provider", () => {
    const firstCache = createCacheProvider("alice");
    firstCache.set("/api/rooms", { data: [{ id: "room-1" }] });

    const nextCache = createCacheProvider("alice");

    expect(nextCache.get("/api/rooms")?.data).toEqual([{ id: "room-1" }]);
  });

  it("persists only entries with data and removes cleared entries", () => {
    const cache = createCacheProvider("alice");
    cache.set("/api/rooms", { data: [{ id: "room-1" }] });
    cache.set("/api/rooms/pending", {});

    expect(JSON.parse(localStorage.getItem(aliceKey) ?? "[]")).toEqual([
      ["/api/rooms", { data: [{ id: "room-1" }] }],
    ]);

    cache.delete("/api/rooms");
    expect(JSON.parse(localStorage.getItem(aliceKey) ?? "[]")).toEqual([]);
  });

  it("keeps each user's cache separate", () => {
    createCacheProvider("alice").set("/api/rooms", { data: ["Alice"] });
    createCacheProvider("bob").set("/api/rooms", { data: ["Bob"] });

    expect(createCacheProvider("alice").get("/api/rooms")?.data).toEqual([
      "Alice",
    ]);
    expect(createCacheProvider("bob").get("/api/rooms")?.data).toEqual([
      "Bob",
    ]);
  });
});
