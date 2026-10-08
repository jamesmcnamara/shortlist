export type StreamingType = "FREE" | "ADS" | "FLATRATE" | "RENT";

export interface StreamingOffer {
  packageId: number;
  name: string;
  iconUrl: string | null;
  url: string;
  type: StreamingType;
}

export interface JustWatchAvailability {
  country: "US";
  checkedAt: string;
  status: "matched" | "not_found" | "unavailable";
  url: string | null;
  offers: StreamingOffer[];
}

export interface StreamingService {
  name: string;
  packageIds: readonly number[];
  rent?: boolean;
}
