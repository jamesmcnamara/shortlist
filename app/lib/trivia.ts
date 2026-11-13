import { z } from "zod";
import { imdbId } from "./box-office";

export interface MovieTrivia {
  url: string;
  fetchedAt: string;
  items: string[];
}

const responseSchema = z.object({
  code: z.literal(200),
  data: z.object({
    id: imdbId,
    type: z.literal("trivia"),
    facts: z.array(z.object({ text: z.string().trim().min(1) })),
    total: z.number().int().nonnegative().optional(),
    has_more: z.boolean().optional(),
  }),
});

export function parseTrivia(data: unknown, id: string): MovieTrivia {
  const { data: trivia } = responseSchema.parse(data);
  if (trivia.id !== imdbId.parse(id)) {
    throw new Error("Crawlora returned trivia for a different movie.");
  }
  if (
    trivia.has_more ||
    (trivia.total !== undefined && trivia.total > trivia.facts.length)
  ) {
    throw new Error("Crawlora returned incomplete IMDb trivia.");
  }
  return {
    url: `https://www.imdb.com/title/${id}/trivia/`,
    fetchedAt: new Date().toISOString(),
    items: [...new Set(trivia.facts.map(({ text }) => text))],
  };
}

export async function getTrivia(id: string): Promise<MovieTrivia> {
  const validatedId = imdbId.parse(id);
  const apiKey = process.env.CRAWLORA_API_KEY?.trim();
  if (!apiKey) throw new Error("CRAWLORA_API_KEY is required for IMDb trivia.");
  const url = new URL("https://api.crawlora.net/api/v1/imdb/title/trivia");
  url.searchParams.set("id", validatedId);
  const response = await fetch(url.toString(), {
    headers: { "x-api-key": apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
    redirect: "error",
    cache: "no-store",
  });
  if (response.status !== 200) {
    throw new Error(`Crawlora IMDb trivia returned ${response.status}.`);
  }
  return parseTrivia(await response.json(), id);
}
