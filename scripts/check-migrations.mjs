import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const snapshot = () =>
  JSON.stringify(
    readdirSync("drizzle", { recursive: true })
      .sort()
      .filter((name) => statSync(join("drizzle", name)).isFile())
      .map((name) => [name, readFileSync(join("drizzle", name), "utf8")]),
  );

const before = snapshot();
const generated = spawnSync(
  process.execPath,
  ["node_modules/drizzle-kit/bin.cjs", "generate"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
);

process.stdout.write(generated.stdout ?? "");
process.stderr.write(generated.stderr ?? "");

if (generated.error || generated.status !== 0) {
  console.error("Migration generation failed.", generated.error ?? "");
  process.exit(1);
}

if (snapshot() !== before) {
  console.error(
    "Migration files changed. Run npm run db:generate locally, review the SQL, and commit all changes in drizzle/.",
  );
  process.exit(1);
}

// Drizzle can report errors or unresolved rename prompts with exit code 0.
if (!generated.stdout.includes("No schema changes, nothing to migrate")) {
  console.error(
    "Migration generation did not confirm a matching schema. Run npm run db:generate locally and resolve any errors or rename prompts.",
  );
  process.exit(1);
}
