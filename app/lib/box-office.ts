import { load } from "cheerio/slim";
import { z } from "zod";

export interface BoxOffice {
  source: "boxofficemojo";
  url: string;
  fetchedAt: string;
  currency: "USD";
  budget: number | null;
  domesticGross: number | null;
  internationalGross: number | null;
  worldwideGross: number | null;
}

export const imdbId = z.string().regex(/^tt\d{7,10}$/);

const titleUrl = (id: string) =>
  `https://www.boxofficemojo.com/title/${imdbId.parse(id)}/`;

const normalized = (text: string) => text.replace(/\s+/g, " ").trim();

function money(text: string): number | null {
  const value = normalized(text);
  if (!value || /^(?:-|\u2013|\u2014)$/.test(value)) return null;
  if (!/^\$(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(value)) {
    throw new Error("Box Office Mojo returned an invalid USD amount.");
  }
  const amount = Number(value.replace(/[$,]/g, ""));
  if (!Number.isSafeInteger(amount)) {
    throw new Error("Box Office Mojo returned an unsafe USD amount.");
  }
  return amount;
}

export function parseBoxOffice(html: string, id: string): BoxOffice {
  const url = titleUrl(id);
  const $ = load(html);
  if ($('link[rel="canonical"]').attr("href") !== url) {
    throw new Error("Box Office Mojo returned a different title or an invalid page.");
  }

  const summary = $(".mojo-performance-summary-table");
  if (
    summary.length !== 1 ||
    normalized(summary.children("h2").text()) !== "All Releases"
  ) {
    throw new Error("Box Office Mojo lifetime summary was not found.");
  }

  const gross = (label: string) => {
    const rows = summary.children("div").filter((_index, row) =>
      normalized($(row).children("span").first().text())
        .replace(/\s*\([^)]*\)$/, "") === label,
    );
    if (rows.length !== 1 || rows.children("span").length !== 2) {
      throw new Error(`Box Office Mojo ${label} total was not found.`);
    }
    return money(rows.children("span").last().text());
  };

  const budget = $(".mojo-summary-values")
    .children("div")
    .filter((_index, row) =>
      normalized($(row).children("span").first().text()) === "Budget",
    );
  if (budget.length > 1) {
    throw new Error("Box Office Mojo returned multiple budgets.");
  }

  return {
    source: "boxofficemojo",
    url,
    fetchedAt: new Date().toISOString(),
    currency: "USD",
    budget: budget.length ? money(budget.children("span").last().text()) : null,
    domesticGross: gross("Domestic"),
    internationalGross: gross("International"),
    worldwideGross: gross("Worldwide"),
  };
}

export async function getBoxOffice(id: string): Promise<BoxOffice> {
  const response = await fetch(titleUrl(id), {
    headers: { Accept: "text/html" },
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Box Office Mojo returned ${response.status}.`);
  }
  if (!response.headers.get("content-type")?.includes("text/html")) {
    throw new Error("Box Office Mojo did not return HTML.");
  }
  return parseBoxOffice(await response.text(), id);
}
