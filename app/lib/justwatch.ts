import { z } from "zod";
import type {
  JustWatchAvailability,
  StreamingOffer,
  StreamingType,
} from "./justwatch-types";

const QUERY = `
  query MovieAvailability($title: String!) {
    popularTitles(
      country: US,
      filter: { searchQuery: $title, objectTypes: [MOVIE] },
      first: 10
    ) {
      edges {
        node {
          content(country: US, language: en) {
            fullPath
            externalIds { tmdbId }
          }
          offers(country: US, platform: WEB, filter: {
            monetizationTypes: [FREE, ADS, FLATRATE, RENT]
          }) {
            monetizationType
            standardWebURL
            package {
              packageId
              clearName
              icon(profile: S100, format: PNG)
            }
          }
        }
      }
    }
  }
`;

// Missing or odd links are skipped rather than failing the whole lookup.
const link = z.string().nullish().catch(null);

const offerSchema = z.object({
  monetizationType: z.enum(["FREE", "ADS", "FLATRATE", "RENT"] satisfies StreamingType[]),
  standardWebURL: link,
  package: z.object({
    packageId: z.int(),
    clearName: z.string(),
    icon: link,
  }),
});

const responseSchema = z.object({
  errors: z.array(z.unknown()).max(0).nullish(),
  data: z.object({
    popularTitles: z.object({
      edges: z.array(
        z.object({
          node: z.object({
            content: z.object({
              fullPath: link,
              externalIds: z.object({ tmdbId: z.unknown() }),
            }),
            // Only the matching movie's offers are validated.
            offers: z.unknown(),
          }),
        }),
      ),
    }),
  }),
});

export function httpsUrl(value: unknown, base?: string): string | null {
  const text = z.string().trim().min(1).safeParse(value);
  if (!text.success) return null;
  try {
    const url = new URL(text.data, base);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function toOffer(
  value: z.infer<typeof offerSchema>,
): StreamingOffer | null {
  const provider = value.package;
  // Some offers have no usable web link; never turn them into clickable URLs.
  const url = httpsUrl(value.standardWebURL);
  if (!url) return null;
  const icon = httpsUrl(provider.icon, "https://images.justwatch.com");
  const iconUrl =
    icon && new URL(icon).hostname === "images.justwatch.com" ? icon : null;
  return {
    packageId: provider.packageId,
    name: provider.clearName,
    iconUrl,
    url,
    type: value.monetizationType,
  };
}

export const unavailable = (): JustWatchAvailability => ({
  country: "US",
  checkedAt: new Date().toISOString(),
  status: "unavailable",
  url: null,
  offers: [],
});

export async function getAvailability(
  tmdbId: number,
  title: string,
): Promise<JustWatchAvailability> {
  const response = await fetch("https://apis.justwatch.com/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { title } }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`JustWatch returned ${response.status}.`);
  }
  const body = responseSchema.safeParse(await response.json());
  if (!body.success) {
    throw new Error("JustWatch returned an invalid response.", {
      cause: body.error,
    });
  }

  // Remakes and similarly named titles must never supply another movie's offers.
  const movie = body.data.data.popularTitles.edges
    .map((edge) => edge.node)
    .find((node) => String(node.content.externalIds.tmdbId) === String(tmdbId));
  const rawOffers = z.array(offerSchema).safeParse(movie ? movie.offers : []);
  if (!rawOffers.success) {
    throw new Error("JustWatch returned an invalid offer list.", {
      cause: rawOffers.error,
    });
  }
  const offers = rawOffers.data.flatMap((offer) => toOffer(offer) ?? []);
  const url = httpsUrl(movie?.content.fullPath, "https://www.justwatch.com");
  return {
    country: "US",
    checkedAt: new Date().toISOString(),
    status: movie ? "matched" : "not_found",
    url: url && new URL(url).hostname === "www.justwatch.com" ? url : null,
    offers: offers.filter(
      (offer, index, all) =>
        all.findIndex(
          (other) =>
            other.packageId === offer.packageId && other.type === offer.type,
        ) === index,
    ),
  };
}
