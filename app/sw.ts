/// <reference lib="webworker" />

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry } from "serwist";
import { NetworkOnly, Serwist } from "serwist";
import { notificationPayload, theatreUrl } from "@/lib/notifications/payload";

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
      [
        "apis",
        "pages",
        "pages-rsc",
        "pages-rsc-prefetch",
        "next-data",
        "others",
      ].map((name) => caches.delete(name)),
    ),
  );
});

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const data = notificationPayload.parse(event.data?.json());
        await self.registration.showNotification(data.title, {
          body: data.body,
          icon: "/icons/icon-192.svg",
          tag: data.tag,
          data: { url: data.url },
        });
      } catch {
        console.error("Unable to display movie notification");
        await self.registration.showNotification("Shortlist", {
          body: "There is new activity on your lists.",
          data: { url: "/" },
        });
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(
    theatreUrl.safeParse(event.notification.data?.url).data ?? "/",
    self.location.origin,
  ).href;
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = clients.find((client) => client.url === url);
      if (existing) await existing.focus();
      else await self.clients.openWindow(url);
    })(),
  );
});
