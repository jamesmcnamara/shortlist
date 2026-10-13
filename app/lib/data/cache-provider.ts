import { z } from "zod";

const CACHE_KEY = "shortlist:swr-cache";
// Search results are only useful for the current visit.
const EPHEMERAL_PREFIX = "/api/tmdb/";

const savedCache = z.array(
  z.tuple([z.string(), z.object({ data: z.unknown().optional(), _k: z.unknown().optional() })]),
);

type CacheEntry = z.infer<typeof savedCache>[number][1];

class LocalStorageCache extends Map<string, CacheEntry> {
  constructor(private readonly storageKey?: string) {
    super();
    if (typeof window === "undefined" || !storageKey) return;

    try {
      const serialized = window.localStorage.getItem(storageKey);
      if (!serialized) return;

      savedCache.parse(JSON.parse(serialized)).forEach(([key, value]) => {
        super.set(key, value);
      });
    } catch (error) {
      console.error("Unable to read the saved SWR cache.", error);
    }
  }

  override set(key: string, value: CacheEntry) {
    super.set(key, value);
    this.persist();
    return this;
  }

  override delete(key: string) {
    const deleted = super.delete(key);
    if (deleted) this.persist();
    return deleted;
  }

  override clear() {
    super.clear();
    this.persist();
  }

  private persist() {
    if (typeof window === "undefined" || !this.storageKey) return;

    try {
      const entries = [...this.entries()]
        .filter(
          ([key, value]) =>
            value.data !== undefined && !key.startsWith(EPHEMERAL_PREFIX),
        )
        .map(([key, value]) => [key, { data: value.data, _k: value._k }]);
      window.localStorage.setItem(this.storageKey, JSON.stringify(entries));
    } catch (error) {
      console.error("Unable to save the SWR cache.", error);
    }
  }
}

export function createCacheProvider(userId?: string) {
  return new LocalStorageCache(
    userId ? `${CACHE_KEY}:${encodeURIComponent(userId)}` : undefined,
  );
}
