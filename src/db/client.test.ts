import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  neon: vi.fn(() => ({})),
  drizzle: vi.fn(() => ({})),
}));
vi.mock("@neondatabase/serverless", () => ({ neon: mocks.neon }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: mocks.drizzle }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.resetModules();
});

describe("database client environment loading", () => {
  it("reads the URL on first connection, not import, and keeps the connection cached", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { getDb } = await import("./client");
    expect(mocks.neon).not.toHaveBeenCalled();

    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost/test");
    const db = getDb();
    expect(mocks.neon).toHaveBeenCalledWith(
      "postgresql://test:test@localhost/test",
    );

    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost/other");
    expect(getDb()).toBe(db);
    expect(mocks.neon).toHaveBeenCalledOnce();
  });

  it("reports a missing URL when connecting and allows retry after configuration", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { getDb } = await import("./client");
    expect(getDb).toThrow("DATABASE_URL is not configured");
    expect(mocks.neon).not.toHaveBeenCalled();

    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost/test");
    expect(getDb()).toBeDefined();
    expect(mocks.neon).toHaveBeenCalledOnce();
  });
});
