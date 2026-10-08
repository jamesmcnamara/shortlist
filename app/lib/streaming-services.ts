import type { StreamingService } from "./justwatch-types";

export const STREAMING_SERVICES: readonly StreamingService[] = [
  { name: "Prime", packageIds: [9, 2100, 10], rent: true },
  { name: "Apple TV", packageIds: [2], rent: true },
  { name: "Disney+", packageIds: [337] },
  { name: "Kanopy", packageIds: [191] },
  { name: "HBO", packageIds: [1899] },
  { name: "Hoopla", packageIds: [212] },
  { name: "Hulu", packageIds: [15] },
  { name: "Netflix", packageIds: [8, 1796] },
  { name: "Peacock", packageIds: [386] },
  { name: "YouTube", packageIds: [235] },
];
