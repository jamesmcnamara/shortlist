import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { getDb } from "@/src/db/client";
import {
  authAccounts,
  authSessions,
  authUsers,
  authVerifications,
} from "@/src/db/neon-auth-schema";

const DAY = 60 * 60 * 24;

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema: {
      user: authUsers,
      session: authSessions,
      account: authAccounts,
      verification: authVerifications,
    },
  }),
  emailAndPassword: { enabled: true },
  session: {
    // Browsers cap cookies at 400 days. Sessions roll forward daily, so anyone
    // who opens the app within that window stays signed in.
    expiresIn: 400 * DAY,
    updateAge: DAY,
  },
  advanced: { database: { generateId: "uuid" } },
  plugins: [nextCookies()],
});

/**
 * Server components can't set cookies, so refreshing here would extend the
 * session in the database without extending the cookie. The client's
 * `useSession` call does the refresh instead.
 */
export const getSession = async () =>
  auth.api.getSession({
    headers: await headers(),
    query: { disableRefresh: true },
  });
