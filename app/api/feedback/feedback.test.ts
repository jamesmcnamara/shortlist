import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/src/db/test-db";
import { setDbForTesting, type DB } from "@/src/db/client";
import { feedback } from "@/src/db/schema";
import { authUsers } from "@/src/db/neon-auth-schema";
import * as feedbackRoute from "./route";

const currentUserId = vi.hoisted(() => ({ value: "" }));
vi.mock("@/lib/auth/server", () => ({
  auth: {
    getSession: async () => ({
      data: currentUserId.value ? { user: { id: currentUserId.value } } : null,
    }),
  },
}));

const ALICE = "11111111-1111-1111-1111-111111111111";

const asUser = (id: string) => {
  currentUserId.value = id;
};

const post = (body: unknown) =>
  new Request("http://test/api/feedback", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(async () => {
  const { db } = await createTestDb();
  setDbForTesting(() => db as unknown as DB);

  await db
    .insert(authUsers)
    .values([{ id: ALICE, name: "Alice", email: "alice@example.com" }]);

  currentUserId.value = "";
});

describe("POST /api/feedback", () => {
  it("requires an authenticated user", async () => {
    const response = await feedbackRoute.POST(post({ message: "Hello" }));
    expect(response.status).toBe(401);
  });

  it("requires a non-empty message", async () => {
    asUser(ALICE);
    const response = await feedbackRoute.POST(post({ message: "   " }));
    expect(response.status).toBe(400);
  });

  it("stores feedback with the acting user, defaulting resolved to false", async () => {
    asUser(ALICE);
    const response = await feedbackRoute.POST(
      post({ message: "Please add dark mode.", category: "feature" }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.userId).toBe(ALICE);
    expect(body.message).toBe("Please add dark mode.");
    expect(body.category).toBe("feature");
    expect(body.resolved).toBe(false);
    expect(body.createdAt).toBeTruthy();

    const { getDb } = await import("@/src/db/client");
    const rows = await getDb()
      .select()
      .from(feedback)
      .where(eq(feedback.userId, ALICE));
    expect(rows).toHaveLength(1);
    expect(rows[0].resolved).toBe(false);
  });

  it("ignores an unrecognized category", async () => {
    asUser(ALICE);
    const response = await feedbackRoute.POST(
      post({ message: "Neat app", category: "not-a-real-category" }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.category).toBeNull();
  });
});
