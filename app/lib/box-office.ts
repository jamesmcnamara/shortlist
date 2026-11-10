import { load } from "cheerio/slim";
import { z } from "zod";

export interface BoxOfficeData {
  source: keyof BoxOfficeSources;
  url?: string;
  fetchedAt?: string;
  currency: "USD";
  budget: number | null;
  budgetSource?: keyof BoxOfficeSources;
  domesticGross: number | null;
  internationalGross: number | null;
  worldwideGross: number | null;
}

export interface MojoBoxOfficeData extends BoxOfficeData {
  source: "boxofficemojo";
  url: string;
  fetchedAt: string;
}

export interface BoxOfficeSources {
  boxofficemojo?: MojoBoxOfficeData;
  tmdb?: { budget: number | null };
  wikipedia?: { budget: number | null; url: string | null };
  manual?: { budget: number };
}

export const validTmdbBudget = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);

export function resolveBoxOffice(
  sources: BoxOfficeSources,
): BoxOfficeData | undefined {
  const budgetSource = (
    ["manual", "boxofficemojo", "tmdb", "wikipedia"] as const
  ).find((source) => {
    const budget = sources[source]?.budget;
    return (
      budget != null &&
      (source !== "tmdb" || validTmdbBudget.safeParse(budget).success)
    );
  });
  const mojo = sources.boxofficemojo;
  if (!mojo && !budgetSource) return undefined;
  return {
    source: mojo ? "boxofficemojo" : budgetSource!,
    currency: "USD",
    url: mojo?.url,
    fetchedAt: mojo?.fetchedAt,
    budget: budgetSource ? sources[budgetSource]!.budget : null,
    ...(budgetSource && { budgetSource }),
    domesticGross: mojo?.domesticGross ?? null,
    internationalGross: mojo?.internationalGross ?? null,
    worldwideGross: mojo?.worldwideGross ?? null,
  };
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

export function parseBoxOffice(html: string, id: string): MojoBoxOfficeData {
  const url = titleUrl(id);
  const $ = load(html);
  const canonical = $('link[rel="canonical"]').attr("href");
  if (canonical !== url && canonical !== `${url}credits/`) {
    throw new Error(
      "Box Office Mojo returned a different title or an invalid page.",
    );
  }

  const summary = $(".mojo-performance-summary-table");
  if (
    summary.length !== 1 ||
    normalized(summary.children("h2").text()) !== "All Releases"
  ) {
    throw new Error("Box Office Mojo lifetime summary was not found.");
  }

  const gross = (label: string) => {
    const rows = summary
      .children("div")
      .filter(
        (_index, row) =>
          normalized($(row).children("span").first().text()).replace(
            /\s*\([^)]*\)$/,
            "",
          ) === label,
      );
    if (rows.length !== 1 || rows.children("span").length !== 2) {
      throw new Error(`Box Office Mojo ${label} total was not found.`);
    }
    return money(rows.children("span").last().text());
  };

  const budget = $(".mojo-summary-values")
    .children("div")
    .filter(
      (_index, row) =>
        normalized($(row).children("span").first().text()) === "Budget",
    );
  if (budget.length > 1) {
    throw new Error("Box Office Mojo returned multiple budgets.");
  }

  return {
    source: "boxofficemojo",
    url: canonical,
    fetchedAt: new Date().toISOString(),
    currency: "USD",
    budget: budget.length ? money(budget.children("span").last().text()) : null,
    domesticGross: gross("Domestic"),
    internationalGross: gross("International"),
    worldwideGross: gross("Worldwide"),
  };
}

export async function getBoxOffice(id: string): Promise<MojoBoxOfficeData> {
  const url = titleUrl(id);
  const options = {
    headers: { Accept: "text/html" },
    signal: AbortSignal.timeout(10_000),
    redirect: "manual",
    cache: "no-store",
  } satisfies RequestInit;
  let response = await fetch(url, options);
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get("location");
    if (!location || new URL(location, url).href !== `${url}credits/`) {
      throw new Error("Box Office Mojo returned an unexpected redirect.");
    }
    response = await fetch(`${url}credits/`, options);
  }
  if (!response.ok) {
    throw new Error(`Box Office Mojo returned ${response.status}.`);
  }
  if (!response.headers.get("content-type")?.includes("text/html")) {
    throw new Error("Box Office Mojo did not return HTML.");
  }
  return parseBoxOffice(await response.text(), id);
}
