import { boolean, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

const neonAuth = pgSchema("neon_auth");

// These tables were created by Neon Auth and are now read and written by our
// own better-auth instance. They are deliberately excluded from the Drizzle Kit
// schema entry point so they are never migrated from here.
const timestamps = {
  createdAt: timestamp("createdAt", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
};

export const authUsers = neonAuth.table("user", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  emailVerified: boolean("emailVerified")
    .notNull()
    .$defaultFn(() => false),
  image: text("image"),
  ...timestamps,
});

export const authSessions = neonAuth.table("session", {
  id: uuid("id").primaryKey(),
  userId: uuid("userId").notNull(),
  token: text("token").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  ...timestamps,
});

export const authAccounts = neonAuth.table("account", {
  id: uuid("id").primaryKey(),
  userId: uuid("userId").notNull(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt", {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", {
    withTimezone: true,
  }),
  scope: text("scope"),
  password: text("password"),
  ...timestamps,
});

export const authVerifications = neonAuth.table("verification", {
  id: uuid("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  ...timestamps,
});
