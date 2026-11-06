import { z } from "zod";
import { when } from "./utils";

export const userAgent =
  "Shortlist/1.0 (https://github.com/jamesmcnamara/shortlist)";

export const articleUrl = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    url.hostname === "en.wikipedia.org" &&
    !url.port &&
    !url.username &&
    !url.password &&
    url.pathname.startsWith("/wiki/") &&
    url.pathname.length > "/wiki/".length
  );
}, "Expected an English Wikipedia article URL.");

const responseSchema = z.object({
  results: z.object({
    bindings: z.array(
      z.object({
        item: z.object({ type: z.literal("uri"), value: z.url() }),
        article: z
          .object({ type: z.literal("uri"), value: articleUrl })
          .optional(),
      }),
    ),
  }),
});
const imdbSchema = z
  .string()
  .regex(/^tt\d{7,10}$/)
  .nullish();

export async function getWikipediaUrl(
  tmdbId: number,
  imdbId?: string,
): Promise<string | undefined> {
  const imdb = imdbSchema.parse(imdbId);

  const matches = await lookup("P4947", String(tmdbId));
  if (matches.length > 1) {
    return;
  }
  if (matches.length > 0) {
    return when(matches.length === 1)(matches[0].article?.value);
  }
  if (!imdb) return;
  const fallback = await lookup("P345", imdb);
  if (fallback.length === 1) {
    return fallback[0].article?.value;
  }
}

const lookup = async (property: "P4947" | "P345", id: string) => {
  const signal = AbortSignal.timeout(4000);
  const query = `
      SELECT DISTINCT ?item ?article WHERE {
        ?item wdt:${property} ${JSON.stringify(id)}.
        OPTIONAL {
          ?article schema:about ?item;
            schema:isPartOf <https://en.wikipedia.org/>.
        }
      }
      LIMIT 2
    `;
  const params = new URLSearchParams({ query, format: "json" });
  const response = await fetch(`https://query.wikidata.org/sparql?${params}`, {
    signal,
    headers: {
      Accept: "application/sparql-results+json",
      "User-Agent": userAgent,
    },
  });
  if (!response.ok) {
    throw new Error(`Wikidata returned ${response.status}.`);
  }
  return responseSchema.parse(await response.json()).results.bindings;
};
