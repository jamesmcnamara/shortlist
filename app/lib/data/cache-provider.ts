import { z } from "zod";

const CACHE_KEY = "shortlist:swr-cache";
// Search results are only useful for the current visit, and static data files
// are too big for localStorage, so the browser's HTTP cache keeps them instead.
const MEMORY_ONLY_PREFIXES = ["/api/tmdb/", "/data/"];

const isPersisted = (key: string) =>
  !MEMORY_ONLY_PREFIXES.some((prefix) => key.startsWith(prefix));

const cacheLine = z.object({
  data: z.unknown().optional(),
  _k: z.unknown().optional(),
});

const savedCache = z.array(z.tuple([z.string(), cacheLine]));

type CacheLine = z.infer<typeof cacheLine>;

class LocalStorageCache extends Map<string, CacheLine> {
  constructor(private readonly storageKey?: string) {
    super();
    if (typeof window === "undefined" || !storageKey) return;

    try {
      const serialized = window.localStorage.getItem(storageKey);
      if (!serialized) return;

      savedCache
        .parse(JSON.parse(serialized))
        .filter(([key]) => isPersisted(key))
        .forEach(([key, value]) => {
          super.set(key, value);
        });
    } catch (error) {
      console.error("Unable to read the saved SWR cache.", error);
    }
  }

  override set(key: string, value: CacheLine) {
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
        .filter(([key, value]) => value.data !== undefined && isPersisted(key))
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
