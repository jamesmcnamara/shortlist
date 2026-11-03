import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getWikipediaUrl } from "./wikipedia";

const url = "https://en.wikipedia.org/wiki/The_Matrix";
const match = (id: string, article?: string) => ({
  item: { type: "uri", value: `https://www.wikidata.org/entity/${id}` },
  ...(article ? { article: { type: "uri", value: article } } : {}),
});
const response = (bindings: ReturnType<typeof match>[]) =>
  Response.json({ results: { bindings } });

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe("Wikipedia lookup", () => {
  it("resolves a unique TMDB match without an IMDb request", async () => {
    vi.mocked(fetch).mockResolvedValue(response([match("Q83495", url)]));
    expect(await getWikipediaUrl(603, "tt0133093")).toBe(url);
    expect(fetch).toHaveBeenCalledOnce();
    const [request, options] = vi.mocked(fetch).mock.calls[0];
    expect(new URL(String(request)).searchParams.get("query")).toContain(
      'wdt:P4947 "603"',
    );
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(options?.headers).toMatchObject({
      Accept: "application/sparql-results+json",
      "User-Agent": expect.stringContaining("Shortlist"),
    });
  });

  it("falls back to IMDb when no TMDB item exists", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([match("Q83495", url)]));
    expect(await getWikipediaUrl(603, "tt0133093")).toBe(url);
    const [request] = vi.mocked(fetch).mock.calls[1];
    expect(new URL(String(request)).searchParams.get("query")).toContain(
      'wdt:P345 "tt0133093"',
    );
  });

  it("returns null when neither identifier has a match", async () => {
    vi.mocked(fetch).mockImplementation(async () => response([]));
    expect(await getWikipediaUrl(603, "tt0133093")).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not request IMDb when it is missing", async () => {
    vi.mocked(fetch).mockResolvedValue(response([]));
    expect(await getWikipediaUrl(603)).toBeUndefined();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("does not guess when the matching item has no English article", async () => {
    vi.mocked(fetch).mockResolvedValue(response([match("Q83495")]));
    expect(await getWikipediaUrl(603, "tt0133093")).toBeUndefined();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("does not fall back when the TMDB match is ambiguous", async () => {
    vi.mocked(fetch).mockResolvedValue(
      response([match("Q1", url), match("Q2", url)]),
    );
    expect(await getWikipediaUrl(603, "tt0133093")).toBeUndefined();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("rejects ambiguous IMDb matches", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([match("Q1", url), match("Q2", url)]));
    expect(await getWikipediaUrl(603, "tt0133093")).toBeUndefined();
  });

  it.each([
    "https://en.wikipedia.org.evil.test/wiki/Movie",
    "javascript:alert(1)",
    "http://en.wikipedia.org/wiki/Movie",
    "https://evil.test/wiki/Movie",
    "https://en.wikipedia.org/wiki/",
    "https://user@en.wikipedia.org/wiki/Movie",
  ])("rejects unsafe article URLs: %s", async (article) => {
    vi.mocked(fetch).mockResolvedValue(response([match("Q1", article)]));
    await expect(getWikipediaUrl(603)).rejects.toThrow();
  });

  it("surfaces service errors", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 429 }));
    await expect(getWikipediaUrl(603)).rejects.toThrow("Wikidata returned 429");
  });

  it("surfaces malformed responses", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ error: "Unavailable" }));
    await expect(getWikipediaUrl(603)).rejects.toThrow();
  });

  it("surfaces timeouts", async () => {
    vi.mocked(fetch).mockRejectedValue(
      new DOMException("Timed out", "TimeoutError"),
    );
    await expect(getWikipediaUrl(603)).rejects.toThrow("Timed out");
  });
});
