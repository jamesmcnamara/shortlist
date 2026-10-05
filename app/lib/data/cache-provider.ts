const CACHE_KEY = "shortlist:swr-cache";
// Search results are only useful for the current visit.
const EPHEMERAL_PREFIX = "/api/tmdb/";

type CacheEntry = { data?: unknown; _k?: unknown };

class LocalStorageCache extends Map<string, CacheEntry> {
  constructor(private readonly storageKey?: string) {
    super();
    if (typeof window === "undefined" || !storageKey) return;

    try {
      const serialized = window.localStorage.getItem(storageKey);
      if (!serialized) return;

      const entries: unknown = JSON.parse(serialized);
      if (!Array.isArray(entries)) throw new Error("Invalid cache format.");

      entries.forEach(([key, value]) => {
        super.set(key, value as CacheEntry);
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
