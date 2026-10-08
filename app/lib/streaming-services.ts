import type { StreamingService } from "./justwatch-types";

export const STREAMING_SERVICES: readonly StreamingService[] = [
  { name: "Amazon Prime Video", packageIds: [9, 2100] },
  { name: "Disney+", packageIds: [337] },
  { name: "Kanopy", packageIds: [191] },
  { name: "HBO Max", packageIds: [1899] },
  { name: "Hoopla", packageIds: [212] },
  { name: "Hulu", packageIds: [15] },
  { name: "Netflix", packageIds: [8, 1796] },
  { name: "Peacock Premium", packageIds: [386] },
  { name: "YouTube Free", packageIds: [235] },
];
