import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTrivia, parseTrivia, type TriviaSnippet } from "./trivia";

const ID = "tt0133093";
const data = (items: TriviaSnippet[] = []) => ({
  code: 200,
  data: {
    id: ID,
    type: "trivia",
    facts: items,
    total: items.length,
  },
});
beforeEach(() => vi.stubEnv("CRAWLORA_API_KEY", "test-crawlora-key"));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("IMDb trivia", () => {
  it("keeps Crawlora's plain text and paragraph breaks without interpreting markup", () => {
    const trivia = parseTrivia(
      data([
        {
          text: "  A performer & a prop.\nAnother paragraph.  ",
          spoiler: false,
        },
        { text: "A second fact with <literal> text.", spoiler: true },
      ]),
      ID,
    );
    expect(trivia.items).toEqual([
      { text: "A performer & a prop.\nAnother paragraph.", spoiler: false },
      { text: "A second fact with <literal> text.", spoiler: true },
    ]);
    expect(trivia.url).toBe(`https://www.imdb.com/title/${ID}/trivia/`);
    expect(Number.isNaN(Date.parse(trivia.fetchedAt))).toBe(false);
  });

  it("deduplicates entries and accepts an explicitly empty collection", () => {
    const fact = { text: "A fact.", spoiler: false };
    const spoiler = { text: "A fact.", spoiler: true };
    expect(parseTrivia(data([fact, fact, spoiler]), ID).items).toEqual([
      fact,
      spoiler,
    ]);
    expect(parseTrivia(data(), ID).items).toEqual([]);
  });

  it.each([
    {},
    { ...data(), code: 503 },
    { code: 200, data: null },
    { code: 200, data: { id: ID, type: "trivia" } },
    { ...data(), data: { ...data().data, type: "goofs" } },
    data([{ text: "   ", spoiler: false }]),
    { ...data(), data: { ...data().data, facts: [{ text: "No flag." }] } },
    {
      ...data(),
      data: {
        ...data().data,
        facts: [{ text: "Bad flag.", spoiler: "false" }],
      },
    },
  ])(
    "rejects invalid or failed responses instead of saving empty trivia",
    (response) => {
      expect(() => parseTrivia(response, ID)).toThrow();
    },
  );

  it("rejects the wrong movie", () => {
    expect(() => parseTrivia(data(), "tt0111161")).toThrow("different movie");
  });

  it("keeps more than 50 entries", () => {
    const items = Array.from({ length: 245 }, (_, i) => ({
      text: `Fact ${i}.`,
      spoiler: i % 2 === 0,
    }));
    expect(parseTrivia(data(items), ID).items).toEqual(items);
  });

  it.each([
    { ...data([{ text: "A fact.", spoiler: false }]).data, total: 245 },
    { ...data([{ text: "A fact.", spoiler: false }]).data, has_more: true },
  ])("rejects incomplete collections", (partial) => {
    expect(() => parseTrivia({ code: 200, data: partial }, ID)).toThrow(
      "incomplete",
    );
  });

  it("fetches from Crawlora with server credentials, a validated ID and a timeout", async () => {
    const items = [{ text: "A fact.", spoiler: true }];
    const fetch = vi.fn().mockResolvedValue(Response.json(data(items)));
    vi.stubGlobal("fetch", fetch);
    expect((await getTrivia(ID)).items).toEqual(items);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe(
      `https://api.crawlora.net/api/v1/imdb/title/trivia?id=${ID}`,
    );
    expect(options.headers).toEqual({
      "x-api-key": "test-crawlora-key",
      Accept: "application/json",
    });
    expect(options.body).toBeUndefined();
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.redirect).toBe("error");
    await expect(getTrivia("not-an-id")).rejects.toThrow();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("reports missing credentials without making a request", async () => {
    vi.stubEnv("CRAWLORA_API_KEY", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(getTrivia(ID)).rejects.toThrow("CRAWLORA_API_KEY");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([202, 403, 429, 500])(
    "surfaces Crawlora HTTP %s without retrying",
    async (status) => {
      const fetch = vi.fn().mockResolvedValue(new Response("", { status }));
      vi.stubGlobal("fetch", fetch);
      await expect(getTrivia(ID)).rejects.toThrow(
        `Crawlora IMDb trivia returned ${status}`,
      );
      expect(fetch).toHaveBeenCalledOnce();
    },
  );
});
