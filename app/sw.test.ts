import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NetworkOnly, Serwist } from "serwist";

vi.mock("@serwist/next/worker", () => ({
  defaultCache: [{ matcher: /assets/, handler: { assetCache: true } }],
}));
vi.mock("serwist", () => ({
  NetworkOnly: class NetworkOnly {},
  Serwist: vi.fn(function () {
    return { addEventListeners: vi.fn() };
  }),
}));

const addEventListener = vi.fn();
const deleteCache = vi.fn().mockResolvedValue(true);

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal("self", { __SW_MANIFEST: [], addEventListener });
  vi.stubGlobal("caches", { delete: deleteCache });
  await import("./sw");
});

afterEach(() => vi.unstubAllGlobals());

describe("service worker cache ownership", () => {
  it.each([
    ["/api/rooms", {}],
    ["/api/auth/get-session", {}],
    ["/alice/watchlist?_rsc=123", { headers: { RSC: "1" } }],
    ["/_next/data/build/alice/watchlist.json", {}],
  ])("uses the network for %s", (path, init) => {
    const options = vi.mocked(Serwist).mock.calls[0][0];
    const rule = options?.runtimeCaching?.[0];
    expect(rule?.handler).toBeInstanceOf(NetworkOnly);
    if (typeof rule?.matcher !== "function") throw new Error("Missing matcher");
    const url = new URL(path, "https://shortlist.test");
    expect(rule.matcher({
      request: new Request(url, init),
      url,
      sameOrigin: true,
      event: {} as FetchEvent,
    })).toBe(true);
  });

  it("bypasses page navigations but preserves asset caching", () => {
    const rule = vi.mocked(Serwist).mock.calls[0][0]?.runtimeCaching?.[0];
    if (typeof rule?.matcher !== "function") throw new Error("Missing matcher");
    const url = new URL("https://shortlist.test/alice/watchlist");
    const request = new Request(url);
    Object.defineProperty(request, "mode", { value: "navigate" });
    expect(rule.matcher({
      request, url, sameOrigin: true, event: {} as FetchEvent,
    })).toBe(true);
    const asset = new URL("https://shortlist.test/_next/static/chunk.js");
    expect(rule.matcher({
      request: new Request(asset), url: asset, sameOrigin: true, event: {} as FetchEvent,
    })).toBe(false);
  });

  it("removes only legacy private-response caches on activation", async () => {
    const activate = addEventListener.mock.calls.find(([name]) => name === "activate")?.[1];
    const waitUntil = vi.fn();
    activate({ waitUntil });
    await waitUntil.mock.calls[0][0];
    expect(deleteCache.mock.calls.map(([name]) => name)).toEqual([
      "apis", "pages", "pages-rsc", "pages-rsc-prefetch", "next-data", "others",
    ]);
  });
});
