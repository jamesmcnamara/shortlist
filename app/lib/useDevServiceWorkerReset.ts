import { useEffect } from "react";

// A service worker left over from a production build serves stale JS in dev.
export function useDevServiceWorkerReset() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (!("serviceWorker" in navigator)) return;
    const wasControlled = Boolean(navigator.serviceWorker.controller);

    void Promise.all([
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(
            registrations.map((registration) => registration.unregister()),
          ),
        ),
      "caches" in window
        ? caches
            .keys()
            .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        : Promise.resolve([]),
    ])
      .then(() => {
        if (wasControlled) window.location.reload();
      })
      .catch((error) =>
        console.error("Unable to reset the service worker.", error),
      );
  }, []);
}
