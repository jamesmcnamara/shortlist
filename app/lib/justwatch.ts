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
            monetizationTypes: [FREE, ADS, FLATRATE]
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStreamingType = (value: unknown): value is StreamingType =>
  value === "FREE" || value === "ADS" || value === "FLATRATE";

export function httpsUrl(value: unknown, base?: string): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value, base);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function parseOffer(value: unknown): StreamingOffer | null {
  if (!isRecord(value) || !isStreamingType(value.monetizationType)) {
    throw new Error("JustWatch returned an invalid streaming offer.");
  }
  const provider = value.package;
  if (
    !isRecord(provider) ||
    typeof provider.packageId !== "number" ||
    !Number.isInteger(provider.packageId) ||
    typeof provider.clearName !== "string"
  ) {
    throw new Error("JustWatch returned an invalid service.");
  }
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
  const body: unknown = await response.json();
  if (
    !isRecord(body) ||
    (Array.isArray(body.errors) && body.errors.length > 0) ||
    !isRecord(body.data) ||
    !isRecord(body.data.popularTitles) ||
    !Array.isArray(body.data.popularTitles.edges)
  ) {
    throw new Error("JustWatch returned an invalid response.");
  }

  const nodes = body.data.popularTitles.edges.map((edge: unknown) => {
    if (
      !isRecord(edge) ||
      !isRecord(edge.node) ||
      !isRecord(edge.node.content) ||
      !isRecord(edge.node.content.externalIds)
    ) {
      throw new Error("JustWatch returned an invalid movie.");
    }
    return {
      tmdbId: edge.node.content.externalIds.tmdbId,
      fullPath: edge.node.content.fullPath,
      offers: edge.node.offers,
    };
  });
  // Remakes and similarly named titles must never supply another movie's offers.
  const movie = nodes.find((node) => String(node.tmdbId) === String(tmdbId));
  const rawOffers: unknown = movie ? movie.offers : [];
  if (!Array.isArray(rawOffers)) {
    throw new Error("JustWatch returned an invalid offer list.");
  }
  const offers = rawOffers.flatMap((offer: unknown) => {
    const parsed = parseOffer(offer);
    return parsed ? [parsed] : [];
  });
  const url = httpsUrl(movie?.fullPath, "https://www.justwatch.com");
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
