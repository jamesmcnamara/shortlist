import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getBoxOffice, parseBoxOffice } from "./box-office";

const html = readFileSync(
  new URL("./fixtures/box-office.html", import.meta.url),
  "utf8",
);
const ID = "tt0816692";
const TITLE_URL = `https://www.boxofficemojo.com/title/${ID}/`;
const response = (body = html) =>
  new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Box Office Mojo parsing", () => {
  it("reads lifetime totals and budget, not opening weekend or original release", () => {
    expect(parseBoxOffice(html, ID)).toEqual({
      source: "boxofficemojo",
      url: TITLE_URL,
      fetchedAt: expect.any(String),
      currency: "USD",
      budget: 165_000_000,
      domesticGross: 203_227_580,
      internationalGross: 579_720_584,
      worldwideGross: 782_948_164,
    });
  });

  it("accepts nested links and extra whitespace", () => {
    const linked = html
      .replace("Worldwide", " \n Worldwide \n ")
      .replace('<span class="money">$782,948,164</span>', '<a href="/chart/"><span class="money">$782,948,164</span></a>');
    expect(parseBoxOffice(linked, ID).worldwideGross).toBe(782_948_164);
  });

  it("keeps missing amounts null without deriving them from other totals", () => {
    const missing = html
      .replace("$579,720,584", "-")
      .replace("$165,000,000", "");
    expect(parseBoxOffice(missing, ID)).toMatchObject({
      budget: null,
      internationalGross: null,
      domesticGross: 203_227_580,
      worldwideGross: 782_948_164,
    });
  });

  it("allows an absent budget", () => {
    expect(parseBoxOffice(html.replace("<span>Budget</span>", "<span>MPAA</span>"), ID).budget).toBeNull();
  });

  it("preserves an explicitly reported zero", () => {
    expect(parseBoxOffice(html.replace("$203,227,580", "$0"), ID).domesticGross).toBe(0);
  });

  it.each([
    ["different movie", html.replaceAll(ID, "tt1234567")],
    ["blocked page", "<html><h1>Verify you are human</h1></html>"],
    ["release-only totals", html.replace("All Releases", "Original Release")],
    ["missing total", html.replace("<span>Worldwide</span>", "<span>Other</span>")],
    ["duplicate total", html.replace("<h2>", "<div><span>Worldwide</span><span>$1</span></div><h2>")],
    ["bad amount", html.replace("$782,948,164", "$782 million")],
    ["bad grouping", html.replace("$782,948,164", "$78,29,48,164")],
    ["negative amount", html.replace("$782,948,164", "-$100")],
    ["wrong currency", html.replace("$782,948,164", "EUR 782,948,164")],
    ["unsafe integer", html.replace("$782,948,164", "$9007199254740992")],
  ])("rejects %s rather than storing misleading data", (_name, body) => {
    expect(() => parseBoxOffice(body, ID)).toThrow();
  });
});

describe("Box Office Mojo requests", () => {
  it("fetches only the fixed IMDb title URL with a timeout and no redirects", async () => {
    const fetch = vi.fn().mockResolvedValue(response());
    vi.stubGlobal("fetch", fetch);
    expect((await getBoxOffice(ID)).worldwideGross).toBe(782_948_164);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(TITLE_URL, {
      headers: { Accept: "text/html" },
      signal: expect.any(AbortSignal),
      redirect: "error",
      cache: "no-store",
    });
  });

  it.each(["https://example.com", "../tt0816692", "tt123", "tt0816692?redirect=x"])(
    "rejects an invalid ID %s before making a request",
    async (id) => {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      await expect(getBoxOffice(id)).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([403, 404, 429, 503])("reports HTTP %s", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status })));
    await expect(getBoxOffice(ID)).rejects.toThrow(`returned ${status}`);
  });

  it("rejects non-HTML responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({})));
    await expect(getBoxOffice(ID)).rejects.toThrow("did not return HTML");
  });

  it("aborts the request after ten seconds", async () => {
    vi.useFakeTimers();
    const signal = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      setTimeout(() => signal.abort(new DOMException("Timeout", "TimeoutError")), ms);
      return signal.signal;
    });
    vi.stubGlobal("fetch", vi.fn((_url, options: RequestInit) =>
      new Promise((_resolve, reject) =>
        options.signal?.addEventListener("abort", () => reject(options.signal?.reason)),
      ),
    ));
    try {
      const pending = expect(getBoxOffice(ID)).rejects.toThrow("Timeout");
      await vi.advanceTimersByTimeAsync(10_000);
      await pending;
      expect(timeout).toHaveBeenCalledWith(10_000);
    } finally {
      vi.useRealTimers();
    }
  });
});
