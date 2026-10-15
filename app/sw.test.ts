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
const showNotification = vi.fn().mockResolvedValue(undefined);
const openWindow = vi.fn().mockResolvedValue(undefined);
const focus = vi.fn().mockResolvedValue(undefined);
const matchAll = vi.fn().mockResolvedValue([]);

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal("self", {
    __SW_MANIFEST: [], addEventListener,
    registration: { showNotification },
    location: { origin: "https://shortlist.test" },
    clients: { matchAll, openWindow },
  });
  matchAll.mockResolvedValue([]);
  vi.stubGlobal("caches", { delete: deleteCache });
  await import("./sw");
});

describe("push notifications", () => {
  const path = "/theatres/44444444-4444-4444-4444-444444444444";
  function listener(name: string) {
    const handler = addEventListener.mock.calls.find(([event]) => event === name)?.[1];
    if (!handler) throw new Error(`Missing ${name} listener`);
    return handler;
  }

  it("displays the supplied movie notification", async () => {
    const waitUntil = vi.fn();
    listener("push")({
      data: { json: () => ({ title: "Movies", body: "Arrival was added.", url: path, tag: "nomination-1" }) },
      waitUntil,
    });
    await waitUntil.mock.calls[0][0];
    expect(showNotification).toHaveBeenCalledWith("Movies", {
      body: "Arrival was added.", icon: "/icons/icon-192.svg",
      tag: "nomination-1", data: { url: path },
    });
  });

  it("shows a visible fallback for invalid push data", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const waitUntil = vi.fn();
    listener("push")({ data: { json: () => { throw new Error("Invalid JSON"); } }, waitUntil });
    await waitUntil.mock.calls[0][0];
    expect(showNotification).toHaveBeenCalledWith("Shortlist", expect.objectContaining({
      data: { url: "/" },
    }));
    log.mockRestore();
  });

  it.each([path, "https://evil.test", "//evil.test"])("opens only a same-origin destination for %s", async (url) => {
    const waitUntil = vi.fn();
    const close = vi.fn();
    listener("notificationclick")({ notification: { close, data: { url } }, waitUntil });
    await waitUntil.mock.calls[0][0];
    expect(close).toHaveBeenCalledOnce();
    expect(openWindow).toHaveBeenCalledWith(`https://shortlist.test${url === path ? path : "/"}`);
  });

  it("focuses an already-open list", async () => {
    matchAll.mockResolvedValue([{ url: `https://shortlist.test${path}`, focus }]);
    const waitUntil = vi.fn();
    listener("notificationclick")({ notification: { close: vi.fn(), data: { url: path } }, waitUntil });
    await waitUntil.mock.calls[0][0];
    expect(focus).toHaveBeenCalledOnce();
    expect(openWindow).not.toHaveBeenCalled();
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("service worker cache ownership", () => {
  it.each([
    ["/api/theatres", {}],
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
