import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "@/src/db/test-db";
import {
  assertDevBranches,
  assertDevDatabase,
  main,
  seedDevUser,
} from "../scripts/dev-sync.mjs";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));
vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  chmod: vi.fn(),
}));

const branches = [
  {
    id: "br-frosty-violet-aym6f7xl",
    parent_id: "br-calm-leaf-ay4tsgz3",
    project_id: "wandering-violet-70519991",
    name: "dev",
    default: false,
    protected: false,
  },
  {
    id: "br-calm-leaf-ay4tsgz3",
    project_id: "wandering-violet-70519991",
    name: "production",
  },
];
const devUrl =
  "postgresql://owner:password@ep-dev.example/neondb?sslmode=require";
const credentials = {
  email: "dev-agent@shortlist.invalid",
  password: "a-unique-development-test-password",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("dev sync safeguards", () => {
  it("accepts only the pinned dev branch with the pinned production parent", () => {
    expect(() => assertDevBranches(branches)).not.toThrow();
    for (const change of [
      { id: "another-branch" },
      { parent_id: "another-parent" },
      { name: "production" },
      { default: true },
      { protected: true },
      { project_id: "another-project" },
    ]) {
      expect(() =>
        assertDevBranches([{ ...branches[0], ...change }, branches[1]]),
      ).toThrow("Refusing to sync");
    }
    expect(() => assertDevBranches([branches[0]])).toThrow("Refusing to sync");
  });

  it("allows pooled dev connections but rejects production or mismatched credentials", () => {
    expect(() =>
      assertDevDatabase(devUrl.replace("ep-dev.", "ep-dev-pooler."), devUrl),
    ).not.toThrow();
    for (const invalid of [
      devUrl.replace("ep-dev", "ep-production"),
      devUrl.replace("neondb", "otherdb"),
      devUrl.replace("owner", "other"),
      devUrl.replace("password", "other"),
    ]) {
      expect(() => assertDevDatabase(invalid, devUrl)).toThrow(
        "Refusing to write",
      );
    }
  });

  it.each([
    ["NODE_ENV", "production"],
    ["VERCEL", "1"],
  ])("refuses deployed environments (%s)", async (key, value) => {
    vi.stubEnv(key, value);
    await expect(main(["--dry-run"])).rejects.toThrow("local-only");
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("dry-runs with explicit branch IDs and makes no writes", async () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce(JSON.stringify(branches))
      .mockReturnValueOnce(devUrl);
    vi.mocked(readFile).mockResolvedValue(`DATABASE_URL=${devUrl}`);
    await main(["--dry-run"]);
    expect(execFileSync).toHaveBeenCalledTimes(2);
    expect(vi.mocked(execFileSync).mock.calls[1][1]).toContain(branches[0].id);
    expect(vi.mocked(execFileSync).mock.calls[1][1]).toContain(
      "wandering-violet-70519991",
    );
  });

  it("stops before reset or migrations if the local URL targets production", async () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce(JSON.stringify(branches))
      .mockReturnValueOnce(devUrl);
    vi.mocked(readFile).mockResolvedValue(
      `DATABASE_URL=${devUrl.replace("ep-dev", "ep-production")}`,
    );
    await expect(main()).rejects.toThrow("Refusing to write");
    expect(execFileSync).toHaveBeenCalledTimes(2);
  });

  it("does not print CLI output, which may contain credentials, on failures", async () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error(`Command failed with secret ${devUrl}`);
    });
    await expect(main(["--dry-run"])).rejects.toThrow("Neon branches failed");
    await expect(main(["--dry-run"])).rejects.not.toThrow("password");
  });

  it.each([false, true])(
    "migrates only the verified dev URL, stops on migration failure, seed-only=%s",
    async (seedOnly) => {
      vi.mocked(readFile)
        .mockResolvedValueOnce(`DATABASE_URL=${devUrl}`)
        .mockResolvedValueOnce(JSON.stringify(credentials));
      vi.mocked(execFileSync).mockImplementation((_file, args) => {
        if (args?.[0] === "scripts/migrate.mjs")
          throw new Error("Migration failed");
        if (args?.includes("list")) return JSON.stringify(branches);
        if (args?.includes("reset")) return "{}";
        return devUrl;
      });
      await expect(main(seedOnly ? ["--seed-only"] : [])).rejects.toThrow(
        "Migration failed",
      );
      const calls = vi.mocked(execFileSync).mock.calls;
      const resetCalls = calls.filter((call) => call[1]?.includes("reset"));
      expect(resetCalls).toHaveLength(seedOnly ? 0 : 1);
      if (!seedOnly) {
        expect(resetCalls[0][1]).toContain(branches[0].id);
        expect(resetCalls[0][1]).toContain("--parent");
      }
      expect(calls.at(-1)?.[1]).toEqual(["scripts/migrate.mjs"]);
      expect(calls.at(-1)?.[2]).toMatchObject({
        env: { DATABASE_URL: devUrl },
      });
    },
  );

  it("stops before migrations if reset fails", async () => {
    vi.mocked(readFile)
      .mockResolvedValueOnce(`DATABASE_URL=${devUrl}`)
      .mockResolvedValueOnce(JSON.stringify(credentials));
    vi.mocked(execFileSync)
      .mockReturnValueOnce(JSON.stringify(branches))
      .mockReturnValueOnce(devUrl)
      .mockImplementationOnce(() => {
        throw new Error("Reset failed");
      });
    await expect(main()).rejects.toThrow("Neon branches failed");
    expect(execFileSync).toHaveBeenCalledTimes(3);
  });
});

describe("dev login seed", () => {
  it("creates a real login, preserves it on retries, and only joins shared theatres", async () => {
    const actualFs =
      await vi.importActual<typeof import("node:fs/promises")>(
        "node:fs/promises",
      );
    vi.mocked(readFile).mockImplementation(actualFs.readFile);
    const { db, client } = await createTestDb();
    try {
      await client.exec(`
        ALTER TABLE neon_auth."user" ALTER COLUMN id SET DEFAULT gen_random_uuid();
        CREATE UNIQUE INDEX dev_test_user_email ON neon_auth."user" (email);
        CREATE TABLE neon_auth."account" (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "accountId" text NOT NULL,
          "providerId" text NOT NULL, "userId" uuid NOT NULL,
          "accessToken" text, "refreshToken" text, "idToken" text,
          "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz,
          scope text, password text,
          "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL
        );
        CREATE TABLE neon_auth."session" (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" uuid NOT NULL, token text NOT NULL,
          "expiresAt" timestamptz NOT NULL, "ipAddress" text, "userAgent" text,
          "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL
        );
      `);
      const ownerId = randomUUID();
      await db.execute(sql`
        INSERT INTO neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
        VALUES (${ownerId}, 'Owner', 'owner@example.com', true, now(), now())
      `);
      await db.execute(sql`
        INSERT INTO theatres (name, created_by, watchlist_for, invite_code, admin_invite_code)
        VALUES ('Private', ${ownerId}, ${ownerId}, 'private', 'private-admin'),
               ('Shared', ${ownerId}, NULL, 'shared', 'shared-admin')
      `);
      await seedDevUser(db, credentials);
      const usersBefore = await client.query('SELECT * FROM neon_auth."user"');
      const theatresBefore = await client.query("SELECT * FROM theatres");
      const accountsBefore = await client.query<{
        providerId: string;
        password: string;
      }>('SELECT * FROM neon_auth."account"');
      expect(accountsBefore.rows).toHaveLength(1);
      expect(accountsBefore.rows[0]).toMatchObject({
        providerId: "credential",
      });
      expect(accountsBefore.rows[0].password).not.toBe(credentials.password);

      await seedDevUser(db, credentials);
      expect(await client.query('SELECT * FROM neon_auth."user"')).toEqual(
        usersBefore,
      );
      expect(await client.query("SELECT * FROM theatres")).toEqual(
        theatresBefore,
      );
      expect(await client.query('SELECT * FROM neon_auth."account"')).toEqual(
        accountsBefore,
      );
      expect(
        (await client.query('SELECT * FROM neon_auth."session"')).rows,
      ).toEqual([]);
      const access = await client.query(`
        SELECT t.name, m.role FROM theatres t JOIN theatre_members m ON t.id = m.theatre_id
      `);
      expect(access.rows).toEqual(
        expect.arrayContaining([
          { name: "Shared", role: "admin" },
          { name: "Watchlist", role: "admin" },
        ]),
      );
      expect(access.rows).toHaveLength(2);

      await expect(
        seedDevUser(db, { ...credentials, password: "wrong-password" }),
      ).rejects.toThrow();
      expect(await client.query('SELECT * FROM neon_auth."account"')).toEqual(
        accountsBefore,
      );
    } finally {
      await client.close();
    }
  }, 30_000);
});
