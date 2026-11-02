import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import vercel from "../../vercel.json";

const checkScript = resolve("scripts/check-migrations.mjs");
let directory: string;

const write = (path: string, content: string) =>
  writeFileSync(join(directory, path), content);

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "shortlist-deployment-"));
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe("migration generation check", () => {
  const generate = (script: string) => {
    mkdirSync(join(directory, "drizzle/meta"), { recursive: true });
    write("drizzle/0000_initial.sql", "select 1;");
    write("drizzle/meta/_journal.json", "{}");
    mkdirSync(join(directory, "node_modules/drizzle-kit"), {
      recursive: true,
    });
    write("node_modules/drizzle-kit/bin.cjs", script);
    return spawnSync(process.execPath, [checkScript], {
      cwd: directory,
      encoding: "utf8",
    });
  };

  it("passes when generation confirms no changes, without a git checkout", () => {
    expect(
      generate('console.log("No schema changes, nothing to migrate");').status,
    ).toBe(0);
  });

  it.each([
    'require("node:fs").writeFileSync("drizzle/0001_new.sql", "select 2;");',
    'require("node:fs").writeFileSync("drizzle/0000_initial.sql", "select 2;");',
    'require("node:fs").writeFileSync("drizzle/meta/_journal.json", "[]");',
    'require("node:fs").unlinkSync("drizzle/0000_initial.sql");',
  ])("rejects generated migration changes: %s", (script) => {
    const result = generate(
      `${script}\nconsole.log("No schema changes, nothing to migrate");`,
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("commit all changes in drizzle/");
  });

  it.each([
    'console.error("Schema load failed"); process.exit(1);',
    'console.error("Schema load failed");',
    'console.log("Is completed_at created or renamed?");',
    "",
  ])("rejects generation failures and unresolved prompts: %s", (script) => {
    expect(generate(script).status).toBe(1);
  });
});

describe("Vercel build ordering", () => {
  it.each([
    ["production", "", ["db:check", "build", "migrate"], 0],
    ["preview", "", ["db:check", "build"], 0],
    ["production", "db:check", ["db:check"], 1],
    ["preview", "db:check", ["db:check"], 1],
    ["production", "migrate", ["db:check", "build", "migrate"], 1],
    ["production", "build", ["db:check", "build"], 1],
  ])(
    "runs %s with failure at '%s' in the correct order",
    (environment, failure, expected, status) => {
      mkdirSync(join(directory, "bin"));
      write(
        "bin/npm",
        `#!${process.execPath}
const step = process.argv[3];
console.log(step);
process.exit(step === process.env.FAIL_STEP ? 1 : 0);
`,
      );
      chmodSync(join(directory, "bin/npm"), 0o755);
      mkdirSync(join(directory, "scripts"));
      write(
        "scripts/migrate.mjs",
        `console.log("migrate");
process.exit(process.env.FAIL_STEP === "migrate" ? 1 : 0);
`,
      );

      const result = spawnSync("sh", ["-c", vercel.buildCommand], {
        cwd: directory,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${join(directory, "bin")}:${process.env.PATH}`,
          VERCEL_ENV: environment,
          FAIL_STEP: failure,
        },
      });

      expect(result.stderr).toBe("");
      expect(result.status).toBe(status);
      expect(result.stdout.trim().split("\n")).toEqual(expected);
    },
  );
});
