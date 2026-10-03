/// <reference lib="webworker" />

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (string | PrecacheEntry)[];
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  runtimeCaching: [
    {
      matcher: ({ request, url, sameOrigin }) =>
        sameOrigin &&
        (url.pathname.startsWith("/api/") ||
          url.pathname.startsWith("/_next/data/") ||
          request.mode === "navigate" ||
          request.headers.has("RSC")),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  skipWaiting: true,
  clientsClaim: true,
});

serwist.addEventListeners();

self.addEventListener("activate", (event) => {
  // Remove private responses saved by the previous network-first defaults.
  event.waitUntil(
    Promise.all(
      ["apis", "pages", "pages-rsc", "pages-rsc-prefetch", "next-data", "others"]
        .map((name) => caches.delete(name)),
    ),
  );
});
