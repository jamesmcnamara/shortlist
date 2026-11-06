import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getWikipediaBudget, parseBudget } from "./wikipedia-budget";

const html = readFileSync(
  new URL("./fixtures/wikipedia-infobox.html", import.meta.url),
  "utf8",
);
const infobox = (cell: string, label = "Budget") =>
  `<table class="infobox"><tbody><tr><th scope="row">${label}</th><td>${cell}</td></tr></tbody></table>`;
const budget = (cell: string) => parseBudget(infobox(cell));

describe("Wikipedia budget parsing", () => {
  it("reads the infobox budget, not the box office or the article text", () => {
    expect(parseBudget(html)).toBe(165_000_000);
  });

  it.each([
    ["$165 million", 165_000_000],
    ["$3.85&#160;million", 3_850_000],
    ["$878,000", 878_000],
    ["$2.264 billion", 2_264_000_000],
    ["$500 thousand", 500_000],
    ["US$15 million", 15_000_000],
    ["$ 15 million", 15_000_000],
    ["est. $20 million", 20_000_000],
    ["$20 million (estimated)", 20_000_000],
    [
      '$14 million<sup class="reference"><a href="#n">[1]</a></sup>',
      14_000_000,
    ],
    ["\n  $14 million\n", 14_000_000],
  ])("reads %j", (cell, expected) => {
    expect(budget(cell)).toBe(expected);
  });

  it.each([
    ["$14–25 million", 19_500_000],
    ["$350–460&#160;million", 405_000_000],
    ["$12 million – $14 million", 13_000_000],
    ["$12 to $14 million", 13_000_000],
    ["$20 million to 25 million", 22_500_000],
    ["$1.5-2 million", 1_750_000],
    ["$878,000–$1 million", 939_000],
    ["$350,000–400,000", 375_000],
  ])("uses the middle of the range %j", (cell, expected) => {
    expect(budget(cell)).toBe(expected);
  });

  it("doesn't read a dash after a budget as a range", () => {
    expect(budget("$20 million – 2019")).toBe(20_000_000);
  });

  it.each([
    [
      "a USD conversion beside the local currency",
      '<a href="/wiki/South_Korean_won">₩</a>13.5 billion<br />(<a href="/wiki/United_States_dollar">$</a>11.4 million)',
      11_400_000,
    ],
    [
      "a USD conversion on its own line",
      "₩13.5 billion<br />$11.4 million",
      11_400_000,
    ],
    [
      "a USD conversion in a list",
      "<ul><li>€6.2 million</li><li>$6.7 million</li></ul>",
      6_700_000,
    ],
    [
      "a USD conversion in parentheses",
      "€6.2 million ($6.7 million)",
      6_700_000,
    ],
    [
      "a USD conversion of another dollar",
      "A$20 million (US$14 million)",
      14_000_000,
    ],
    [
      "the budget before an inflation estimate",
      "$20 million (equivalent to $38 million in 2023)",
      20_000_000,
    ],
  ])("takes %s", (_name, cell, expected) => {
    expect(budget(cell)).toBe(expected);
  });

  it.each([
    ["no USD amount", "€14 million"],
    ["rupees", '<span style="white-space: nowrap">₹550</span> crore'],
    [
      "an inflation figure alone",
      "₹550 crore (equivalent to US$71 million in 2023)",
    ],
    ["Australian dollars", "A$20 million"],
    ["Canadian dollars", "C$20 million"],
    ["Hong Kong dollars", "HK$20 million"],
    ["a lower bound", "Over $20 million"],
    ["a lower bound after text", "at least US$20 million"],
    ["an upper bound", "Under $20 million"],
    ["a plus sign after the number", "$20+ million"],
    ["a plus sign after the unit", "$20 million+"],
    ["an abbreviated unit", "$20M"],
    ["an unknown unit", "$20 mn"],
    ["no amount", "Unknown"],
    ["an empty cell", ""],
    ["a zero budget", "$0"],
  ])("ignores %s", (_name, cell) => {
    expect(budget(cell)).toBeNull();
  });

  it("ignores amounts too large to store exactly", () => {
    expect(budget("$99,999,999,999 billion")).toBeNull();
  });

  it("ignores pages without exactly one infobox budget", () => {
    expect(parseBudget(infobox("$5 million", "Box office"))).toBeNull();
    expect(parseBudget("<p>It cost $5 million.</p>")).toBeNull();
    expect(
      parseBudget(
        `<table class="wikitable"><tr><th>Budget</th><td>$5 million</td></tr></table>`,
      ),
    ).toBeNull();
    expect(
      parseBudget(infobox("$5 million") + infobox("$6 million")),
    ).toBeNull();
  });

  it("matches the label whatever its whitespace", () => {
    expect(parseBudget(infobox("$5 million", "\n Budget \n"))).toBe(5_000_000);
  });
});

describe("Wikipedia budget lookup", () => {
  const url = "https://en.wikipedia.org/wiki/Interstellar_(film)";
  const lead = (text = html) => Response.json({ parse: { text } });

  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("asks for the lead section of the stored article", async () => {
    vi.mocked(fetch).mockResolvedValue(lead());
    expect(await getWikipediaBudget(url)).toBe(165_000_000);
    expect(fetch).toHaveBeenCalledOnce();
    const [request, options] = vi.mocked(fetch).mock.calls[0];
    const target = new URL(String(request));
    expect(target.origin + target.pathname).toBe(
      "https://en.wikipedia.org/w/api.php",
    );
    expect(Object.fromEntries(target.searchParams)).toEqual({
      action: "parse",
      page: "Interstellar_(film)",
      prop: "text",
      section: "0",
      redirects: "1",
      format: "json",
      formatversion: "2",
    });
    expect(options).toMatchObject({
      headers: {
        Accept: "application/json",
        "User-Agent": expect.stringContaining("Shortlist"),
      },
      redirect: "error",
      cache: "no-store",
    });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ["https://en.wikipedia.org/wiki/Am%C3%A9lie", "Amélie"],
    ["https://en.wikipedia.org/wiki/Amélie", "Amélie"],
    [
      "https://en.wikipedia.org/wiki/Dude,_Where%27s_My_Car%3F",
      "Dude,_Where's_My_Car?",
    ],
    ["https://en.wikipedia.org/wiki/Mr._%26_Mrs._Smith", "Mr._&_Mrs._Smith"],
  ])("decodes the title of %s", async (stored, page) => {
    vi.mocked(fetch).mockResolvedValue(lead());
    await getWikipediaBudget(stored);
    const [request] = vi.mocked(fetch).mock.calls[0];
    expect(new URL(String(request)).searchParams.get("page")).toBe(page);
  });

  it.each([
    "https://example.com/wiki/Interstellar_(film)",
    "https://en.wikipedia.org.example.com/wiki/Interstellar_(film)",
    "http://en.wikipedia.org/wiki/Interstellar_(film)",
    "https://en.wikipedia.org/w/index.php?title=Interstellar_(film)",
    "https://en.wikipedia.org/wiki/",
    "not a url",
    "",
  ])("never requests %j", async (stored) => {
    await expect(getWikipediaBudget(stored)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("has no budget for a page without one", async () => {
    vi.mocked(fetch).mockResolvedValue(lead("<p>No infobox.</p>"));
    expect(await getWikipediaBudget(url)).toBeNull();
  });

  it("has no budget for a missing page", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ error: { code: "missingtitle", info: "Missing." } }),
    );
    expect(await getWikipediaBudget(url)).toBeNull();
  });

  it("fails on other API errors", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ error: { code: "ratelimited", info: "Slow down." } }),
    );
    await expect(getWikipediaBudget(url)).rejects.toThrow("ratelimited");
  });

  it("fails on HTTP errors", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 503 }));
    await expect(getWikipediaBudget(url)).rejects.toThrow("503");
  });

  it("fails on unexpected bodies", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ query: {} }));
    await expect(getWikipediaBudget(url)).rejects.toThrow();
    vi.mocked(fetch).mockResolvedValue(new Response("<html>", { status: 200 }));
    await expect(getWikipediaBudget(url)).rejects.toThrow();
  });

  it("fails on network errors and timeouts", async () => {
    vi.mocked(fetch).mockRejectedValue(
      new DOMException("The operation timed out.", "TimeoutError"),
    );
    await expect(getWikipediaBudget(url)).rejects.toThrow("timed out");
  });
});
