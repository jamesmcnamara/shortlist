import { load } from "cheerio/slim";
import { z } from "zod";
import { articleUrl, userAgent } from "./wikipedia";

const SCALES: Record<string, number> = {
  thousand: 1e3,
  million: 1e6,
  billion: 1e9,
};
const UNIT = "thousand|million|billion";
const AMOUNT = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(${UNIT})?`;
// A "$" right after a letter is another currency (A$, C$, HK$). The top of a
// range can skip its "$" only with a unit or separators, so "$20 million – 2019"
// isn't a range.
const USD = new RegExp(
  String.raw`(?<![a-z])(?:US)?\$\s*${AMOUNT}` +
    String.raw`(?:\s*(?:[–—−-]|\bto\b)\s*(?:(?:US)?\$\s*|(?=\d{1,3},\d{3}|[\d.]+\s*(?:${UNIT})))${AMOUNT})?`,
  "i",
);
const BOUND = /\b(?:over|under|less than|more than|at least|up to)\b|[<>≥≤]/i;

const normalized = (text: string) => text.replace(/\s+/g, " ").trim();
const scale = (word = "") => SCALES[word.toLowerCase()] ?? 1;

function dollars(digits: string, word?: string, rangeWord?: string) {
  const value = Number(digits.replaceAll(",", ""));
  // In "$14–25 million" the 14 shares the unit of the 25.
  return value * scale(word ?? (value < 1000 ? rangeWord : undefined));
}

function budgetFromText(text: string): number | null {
  // "(equivalent to $38 million in 2023)" is inflation-adjusted, not the budget.
  const [cell] = text.split(/\b(?:equivalent|adjusted|inflation)\b/i);
  const match = USD.exec(cell);
  if (!match) return null;
  const [found, low, lowWord, high, highWord] = match;
  const before = cell.slice(0, match.index);
  const after = cell.slice(match.index + found.length);
  if (BOUND.test(before) || /^\s*\+/.test(after)) return null;

  const amounts = [
    dollars(low, lowWord, highWord),
    ...(high ? [dollars(high, highWord)] : []),
  ];
  const budget = Math.round(
    amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length,
  );
  // Under $1,000 means a unit we don't know, like "$20M".
  return amounts.every((amount) => amount >= 1000) &&
    Number.isSafeInteger(budget)
    ? budget
    : null;
}

export function parseBudget(html: string): number | null {
  const $ = load(html);
  const rows = $("table.infobox tr").filter(
    (_index, row) => normalized($(row).children("th").text()) === "Budget",
  );
  if (rows.length !== 1) return null;

  const cell = rows.children("td").first().clone();
  cell.find("sup, style").remove();
  // Line breaks and list items would otherwise glue "billion" to the next "$".
  cell.find("br, li, p, div").after(" ");
  return budgetFromText(normalized(cell.text()));
}

const lead = z.union([
  z.object({ parse: z.object({ text: z.string() }) }),
  z.object({ error: z.object({ code: z.string() }) }),
]);

export async function getWikipediaBudget(url: string): Promise<number | null> {
  const { pathname } = new URL(articleUrl.parse(url));
  const params = new URLSearchParams({
    action: "parse",
    page: decodeURIComponent(pathname.slice("/wiki/".length)),
    prop: "text",
    section: "0",
    redirects: "1",
    format: "json",
    formatversion: "2",
  });
  const response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
    headers: { Accept: "application/json", "User-Agent": userAgent },
    signal: AbortSignal.timeout(5_000),
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Wikipedia returned ${response.status}.`);
  }

  const body = lead.parse(await response.json());
  if ("parse" in body) return parseBudget(body.parse.text);
  // The API reports a missing page with HTTP 200.
  if (body.error.code === "missingtitle") return null;
  throw new Error(`Wikipedia returned ${body.error.code}.`);
}
