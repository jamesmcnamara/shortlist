import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { neon } from "@neondatabase/serverless";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import {
  authAccounts,
  authSessions,
  authUsers,
  authVerifications,
} from "../src/db/neon-auth-schema.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const credentialsPath = new URL("../.dev-user.json", import.meta.url);
const projectId = "wandering-violet-70519991";
const devBranchId = "br-frosty-violet-aym6f7xl";
const productionBranchId = "br-calm-leaf-ay4tsgz3";
const email = "dev-agent@shortlist.invalid";

export function assertDevBranches(branches) {
  const dev = branches.find((branch) => branch.id === devBranchId);
  const production = branches.find(
    (branch) => branch.id === productionBranchId,
  );
  if (
    dev?.name !== "dev" ||
    production?.name !== "production" ||
    dev.parent_id !== production.id ||
    dev.default !== false ||
    dev.protected !== false ||
    dev.project_id !== projectId ||
    production.project_id !== projectId
  ) {
    throw new Error(
      "Refusing to sync: the expected dev/production branch relationship has changed.",
    );
  }
}

export function assertDevDatabase(localUrl, devUrl) {
  const local = new URL(localUrl);
  const dev = new URL(devUrl);
  const hostname = (url) => url.hostname.replace("-pooler.", ".");
  if (
    !["postgres:", "postgresql:"].includes(local.protocol) ||
    hostname(local) !== hostname(dev) ||
    local.pathname !== dev.pathname ||
    local.username !== dev.username ||
    local.password !== dev.password
  ) {
    throw new Error(
      "Refusing to write: .env.local DATABASE_URL does not match dev. Run npm run neon:dev first.",
    );
  }
}

async function getCredentials() {
  try {
    await writeFile(
      credentialsPath,
      JSON.stringify(
        {
          email,
          password: randomBytes(24).toString("base64url"),
        },
        null,
        2,
      ) + "\n",
      { flag: "wx", mode: 0o600 },
    );
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  const content = await readFile(credentialsPath, "utf8");
  let credentials;
  try {
    credentials = JSON.parse(content);
  } catch {
    throw new Error(
      "Invalid JSON in .dev-user.json; its contents have not been logged.",
    );
  }
  if (
    credentials?.email !== email ||
    typeof credentials.password !== "string" ||
    credentials.password.length < 16
  ) {
    throw new Error(
      "Invalid .dev-user.json: expected the dev email and a password of at least 16 characters.",
    );
  }
  await chmod(credentialsPath, 0o600);
  return credentials;
}

export async function seedDevUser(db, credentials) {
  const auth = betterAuth({
    secret: randomBytes(32).toString("base64url"),
    baseURL: "http://localhost:3030",
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: authUsers,
        account: authAccounts,
        session: authSessions,
        verification: authVerifications,
      },
    }),
    emailAndPassword: { enabled: true },
    advanced: { database: { generateId: "uuid" } },
    logger: { disabled: true },
  });
  const existing = await db.execute(sql`
    SELECT id FROM neon_auth."user" WHERE email = ${credentials.email}
  `);
  // Sign-in on retries proves ownership rather than overwriting an existing account.
  const result = existing.rows.length
    ? await auth.api.signInEmail({ body: credentials })
    : await auth.api.signUpEmail({
        body: { ...credentials, name: "Dev Agent" },
      });
  const userId = result.user.id;
  const inviteCode = randomBytes(16).toString("hex");
  const adminInviteCode = randomBytes(16).toString("hex");
  try {
    await db.execute(sql`
      WITH watchlist AS (
        INSERT INTO theatres (name, created_by, watchlist_for, invite_code, admin_invite_code)
        VALUES ('Watchlist', ${userId}, ${userId}, ${inviteCode}, ${adminInviteCode})
        ON CONFLICT (watchlist_for) DO UPDATE
          SET watchlist_for = EXCLUDED.watchlist_for
        RETURNING id
      ), accessible_theatres AS (
        SELECT id FROM watchlist
        UNION
        SELECT id FROM theatres WHERE watchlist_for IS NULL
      )
      INSERT INTO theatre_members (theatre_id, user_id, role)
      SELECT id, ${userId}, 'admin' FROM accessible_theatres
      ON CONFLICT (theatre_id, user_id) DO UPDATE SET role = 'admin'
    `);
  } finally {
    await db.execute(sql`
      DELETE FROM neon_auth."session" WHERE token = ${result.token}
    `);
  }
}

function runNeon(args) {
  try {
    return execFileSync(
      process.execPath,
      [
        "node_modules/neonctl/bin/cli.js",
        ...args,
        "--project-id",
        projectId,
        "--output",
        "json",
        "--no-color",
      ],
      {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 60_000,
      },
    ).trim();
  } catch {
    throw new Error(
      `Neon ${args[0]} failed. Check CLI authentication and connectivity; no credentials were logged.`,
    );
  }
}

export async function main(args = process.argv.slice(2)) {
  if (args.some((arg) => !["--seed-only", "--dry-run"].includes(arg))) {
    throw new Error(
      "Usage: npm run dev:sync [-- --dry-run] or npm run dev:seed",
    );
  }
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new Error(
      "This command is local-only; refusing to run in production or on Vercel.",
    );
  }
  assertDevBranches(JSON.parse(runNeon(["branches", "list"])));
  const env = parseEnv(
    await readFile(new URL("../.env.local", import.meta.url), "utf8"),
  );
  if (!env.DATABASE_URL)
    throw new Error("DATABASE_URL is missing from .env.local.");
  const local = new URL(env.DATABASE_URL);
  const connectionArgs = [
    "connection-string",
    devBranchId,
    "--database-name",
    decodeURIComponent(local.pathname.slice(1)),
    "--role-name",
    decodeURIComponent(local.username),
  ];
  const devUrl = runNeon(connectionArgs);
  assertDevDatabase(env.DATABASE_URL, devUrl);
  if (args.includes("--dry-run")) {
    const steps = args.includes("--seed-only")
      ? "migrate and seed .dev-user.json"
      : "refresh dev from production, migrate, and seed .dev-user.json";
    console.log(
      `Verified dev branch and .env.local. Would ${steps}. No changes made.`,
    );
    return;
  }
  const credentials = await getCredentials();
  if (!args.includes("--seed-only")) {
    console.log("Replacing dev with the latest production schema and data...");
    runNeon(["branches", "reset", devBranchId, "--parent"]);
  }
  const refreshedUrl = runNeon(connectionArgs);
  assertDevDatabase(env.DATABASE_URL, refreshedUrl);
  execFileSync(process.execPath, ["scripts/migrate.mjs"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: refreshedUrl },
    stdio: "inherit",
  });
  try {
    await seedDevUser(drizzle(neon(refreshedUrl)), credentials);
  } catch (error) {
    const code =
      error.statusCode ??
      error.cause?.code ??
      error.code ??
      "auth/database error";
    throw new Error(
      `Dev login setup failed (${code}). Check migrations and .dev-user.json; existing account passwords are never overwritten.`,
    );
  }
  console.log(
    "Dev test user ready. Login credentials: .dev-user.json (git-ignored). Restart any running dev server after a sync.",
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Dev setup failed: ${error.message}`);
    process.exitCode = 1;
  });
}
