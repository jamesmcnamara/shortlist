import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/src/db/test-db";
import { setDbForTesting, type DB } from "@/src/db/client";
import { authAccounts, authUsers } from "@/src/db/neon-auth-schema";
import { theatres } from "@/src/db/schema";

vi.mock("better-auth/next-js", () => ({
  nextCookies: () => ({ id: "next-cookies" }),
}));

let fixture: Awaited<ReturnType<typeof createTestDb>>;
let auth: typeof import("@/lib/auth/server").auth;
let signUpWithHandle: typeof import("./sign-up/actions").signUpWithHandle;
let signInWithHandleOrEmail: typeof import("./sign-in/actions").signInWithHandleOrEmail;

const signUpForm = (username: string, password: string) => {
  const data = new FormData();
  data.set("username", username);
  data.set("password", password);
  return data;
};

const signInForm = (identifier: string, password: string) => {
  const data = new FormData();
  data.set("identifier", identifier);
  data.set("password", password);
  return data;
};

beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  fixture = await createTestDb();
  await fixture.client.exec(`
    ALTER TABLE neon_auth."user" ALTER COLUMN id SET DEFAULT gen_random_uuid();
    CREATE UNIQUE INDEX auth_test_user_email ON neon_auth."user" (email);
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
  setDbForTesting(() => fixture.db as unknown as DB);
  ({ auth } = await import("@/lib/auth/server"));
  ({ signUpWithHandle } = await import("./sign-up/actions"));
  ({ signInWithHandleOrEmail } = await import("./sign-in/actions"));
}, 30_000);

afterAll(async () => {
  setDbForTesting(null);
  vi.unstubAllEnvs();
  await fixture?.client.close();
});

it("creates a handle-only account and signs it in through Better Auth", async () => {
  const data = signUpForm(" @Alice-2 ", "example-password");
  data.set("next", "/join/invite");
  expect(await signUpWithHandle(null, data)).toEqual({
    redirectTo: "/join/invite",
  });

  const [user] = await fixture.db.select().from(authUsers);
  expect(user).toMatchObject({
    name: "alice-2",
    username: "alice-2",
    email: expect.stringContaining("@accounts.shortlist.invalid"),
  });
  const [account] = await fixture.db.select().from(authAccounts);
  expect(account.password).not.toBe("example-password");
  expect(
    await fixture.db
      .select()
      .from(theatres)
      .where(eq(theatres.watchlistFor, user.id)),
  ).toHaveLength(1);
  expect(
    await signInWithHandleOrEmail(
      null,
      signInForm("@ALICE-2", "example-password"),
    ),
  ).toEqual({ redirectTo: "/" });
  expect(
    await signInWithHandleOrEmail(
      null,
      signInForm("alice-2", "wrong-password"),
    ),
  ).toHaveProperty("error");
  expect(
    await signUpWithHandle(null, signUpForm("alice-2", "example-password")),
  ).toHaveProperty("error");
}, 30_000);

it("preserves email login and short passwords for existing accounts", async () => {
  await auth.api.signUpEmail({
    body: {
      name: "Legacy user",
      email: "legacy@example.com",
      username: "legacy-user",
      password: "abcxxxxx",
    },
  });
  expect(
    await signInWithHandleOrEmail(
      null,
      signInForm("legacy@example.com", "abc"),
    ),
  ).toEqual({ redirectTo: "/" });
  expect(
    await signInWithHandleOrEmail(null, signInForm("legacy-user", "abc")),
  ).toEqual({ redirectTo: "/" });
}, 30_000);

it("allows a handle to be reused after its previous owner changes it", async () => {
  expect(
    await signUpWithHandle(
      null,
      signUpForm("first-handle", "example-password"),
    ),
  ).toEqual({ redirectTo: "/" });
  await fixture.db
    .update(authUsers)
    .set({ username: "new-handle" })
    .where(eq(authUsers.username, "first-handle"));
  expect(
    await signUpWithHandle(
      null,
      signUpForm("first-handle", "example-password"),
    ),
  ).toEqual({ redirectTo: "/" });
}, 30_000);
