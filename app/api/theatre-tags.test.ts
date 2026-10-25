import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/src/db/test-db";
import { setDbForTesting, type DB } from "@/src/db/client";
import { authUsers } from "@/src/db/neon-auth-schema";
import { tags, theatreMembers, theatres, theatreTags } from "@/src/db/schema";
import { listTheatreTags, updateTheatre } from "@/app/lib/theatre-tags";
import * as theatreRoute from "./theatres/[theatreId]/route";
import * as joinRoute from "./join/[code]/route";

const currentUserId = vi.hoisted(() => ({ value: "" }));
vi.mock("@/lib/auth/server", () => ({
  getSession: async () =>
    currentUserId.value ? { user: { id: currentUserId.value } } : null,
}));

const ADMIN = "11111111-1111-1111-1111-111111111111";
const MEMBER = "22222222-2222-2222-2222-222222222222";
const OUTSIDER = "33333333-3333-3333-3333-333333333333";
let fixture: Awaited<ReturnType<typeof createTestDb>>;
let theatreId: string;
let otherId: string;
const route = () => ({ params: Promise.resolve({ theatreId }) });
const patch = (body: unknown) =>
  theatreRoute.PATCH(
    new Request("http://test", { method: "PATCH", body: JSON.stringify(body) }),
    route(),
  );
const storedTheatre = () => fixture.db.query.theatres.findFirst({
  where: eq(theatres.id, theatreId),
});

beforeEach(async () => {
  fixture = await createTestDb();
  setDbForTesting(() => fixture.db as unknown as DB);
  currentUserId.value = ADMIN;
  await fixture.db.insert(authUsers).values([
    { id: ADMIN, name: "Admin", email: "admin@example.com" },
    { id: MEMBER, name: "Member", email: "member@example.com" },
    { id: OUTSIDER, name: "Outsider", email: "outsider@example.com" },
  ]);
  const rows = await fixture.db.insert(theatres).values([
    { name: "Club", createdBy: ADMIN, inviteCode: "member-code", adminInviteCode: "admin-code" },
    { name: "Other", createdBy: OUTSIDER, inviteCode: "other-member", adminInviteCode: "other-admin" },
  ]).returning();
  theatreId = rows[0].id;
  otherId = rows[1].id;
  await fixture.db.insert(theatreMembers).values([
    { theatreId, userId: ADMIN, role: "admin" },
    { theatreId, userId: MEMBER, role: "member" },
  ]);
});

afterEach(async () => {
  setDbForTesting(null);
  vi.restoreAllMocks();
  await fixture.client.close();
});

describe("theatre descriptions and tags", () => {
  it("saves trimmed descriptions with canonical, deduplicated text-keyed tags", async () => {
    const response = await patch({ description: "  Our #SciFi #scifi #2026 #date-night  " });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.description).toBe("Our #SciFi #scifi #2026 #date-night");
    expect(body).not.toHaveProperty("inviteCode");
    expect(body).not.toHaveProperty("adminInviteCode");
    expect(await listTheatreTags(theatreId)).toEqual(["2026", "date-night", "scifi"]);
    expect(await fixture.db.select().from(tags).orderBy(tags.name)).toEqual([
      { name: "2026" }, { name: "date-night" }, { name: "scifi" },
    ]);
    const related = await fixture.db.query.theatres.findFirst({
      where: eq(theatres.id, theatreId),
      with: { tags: { with: { tagDefinition: true } } },
    });
    expect(related?.tags).toContainEqual({
      theatreId, tag: "scifi", tagDefinition: { name: "scifi" },
    });
  });

  it("replaces associations without renaming tags or changing another theatre", async () => {
    await patch({ description: "#Horror" });
    await updateTheatre(otherId, { description: "#horror" });
    await patch({ description: "#Comedy" });
    expect(await listTheatreTags(theatreId)).toEqual(["comedy"]);
    expect(await listTheatreTags(otherId)).toEqual(["horror"]);
    expect(await fixture.db.select().from(tags).orderBy(tags.name)).toEqual([
      { name: "comedy" }, { name: "horror" },
    ]);
    await patch({ description: "#COMEDY" });
    expect(await listTheatreTags(theatreId)).toEqual(["comedy"]);
  });

  it("clears associations with empty or untagged descriptions but keeps the dictionary", async () => {
    await patch({ description: "#Horror" });
    await patch({ description: "Just movies" });
    expect(await listTheatreTags(theatreId)).toEqual([]);
    expect((await storedTheatre())?.description).toBe("Just movies");
    await patch({ description: "#Horror" });
    expect((await patch({ description: " \n " })).status).toBe(200);
    expect((await storedTheatre())?.description).toBeNull();
    expect(await listTheatreTags(theatreId)).toEqual([]);
    expect(await fixture.db.select().from(tags)).toEqual([{ name: "horror" }]);
  });

  it("keeps descriptions and tags on rename-only saves and supports combined saves", async () => {
    await patch({ description: "#Horror" });
    expect((await patch({ name: "Renamed" })).status).toBe(200);
    expect((await storedTheatre())?.description).toBe("#Horror");
    expect(await listTheatreTags(theatreId)).toEqual(["horror"]);
    await patch({ name: "Both", description: "#Comedy" });
    expect(await storedTheatre()).toMatchObject({ name: "Both", description: "#Comedy" });
    expect(await listTheatreTags(theatreId)).toEqual(["comedy"]);
  });

  it("rejects invalid descriptions, empty updates, and tag-only updates", async () => {
    for (const body of [
      {}, { description: null }, { description: 1 }, { description: [] },
      { name: " " }, { tags: ["horror"] }, { description: "#horror", name: "" },
    ]) {
      expect((await patch(body)).status).toBe(400);
    }
    expect((await storedTheatre())?.description).toBeNull();
    expect(await listTheatreTags(theatreId)).toEqual([]);
  });

  it("derives tags from the description, not a supplied tag list", async () => {
    expect((await patch({ description: "#Comedy", tags: ["horror"] })).status).toBe(200);
    expect(await listTheatreTags(theatreId)).toEqual(["comedy"]);
  });

  it("only lets admins edit, including when a caller supplies another theatre ID", async () => {
    for (const [userId, status] of [["", 401], [MEMBER, 403], [OUTSIDER, 404]] as const) {
      currentUserId.value = userId;
      expect((await patch({ description: "#Horror" })).status).toBe(status);
    }
    currentUserId.value = ADMIN;
    const originalId = theatreId;
    theatreId = otherId;
    expect((await patch({ description: "#Horror" })).status).toBe(404);
    theatreId = originalId;
    expect((await storedTheatre())?.description).toBeNull();
    expect(await fixture.db.select().from(tags)).toEqual([]);
  });

  it("shows descriptions and tags publicly without exposing membership or invite details", async () => {
    await patch({ description: "Our #Horror films" });
    for (const userId of ["", OUTSIDER, MEMBER, ADMIN]) {
      currentUserId.value = userId;
      const body = await (await theatreRoute.GET(new Request("http://test"), route())).json();
      expect(body.theatre.description).toBe("Our #Horror films");
      expect(body.tags).toEqual(["horror"]);
      expect(body.theatre).not.toHaveProperty("inviteCode");
      expect(body.theatre).not.toHaveProperty("adminInviteCode");
      if (!userId || userId === OUTSIDER) {
        expect(body.membership).toBeNull();
        expect(body).not.toHaveProperty("members");
        expect(body).not.toHaveProperty("inviteCode");
      }
    }
    currentUserId.value = "";
    const preview = await joinRoute.GET(new Request("http://test"), {
      params: Promise.resolve({ code: "member-code" }),
    });
    expect((await preview.json()).theatre).toEqual({
      name: "Club", description: "Our #Horror films",
    });
  });

  it("rolls back the text, new dictionary entries, and associations when a tag write fails", async () => {
    await patch({ description: "#Horror" });
    await fixture.client.exec(`
      CREATE FUNCTION reject_tag() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.tag = 'broken' THEN RAISE EXCEPTION 'Test write failure'; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER reject_tag BEFORE INSERT ON theatre_tags
      FOR EACH ROW EXECUTE FUNCTION reject_tag();
    `);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await patch({ name: "Should roll back", description: "#Broken" });
    expect(response.status).toBe(500);
    expect(log).toHaveBeenCalled();
    expect(await storedTheatre()).toMatchObject({ name: "Club", description: "#Horror" });
    expect(await listTheatreTags(theatreId)).toEqual(["horror"]);
    expect(await fixture.db.select().from(tags)).toEqual([{ name: "horror" }]);
  });

  it("keeps the final description and associations together across concurrent saves", async () => {
    const responses = await Promise.all([
      patch({ description: "#Horror" }),
      patch({ description: "#Comedy #2026" }),
      patch({ description: "#Drama" }),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    const stored = await storedTheatre();
    expect(await listTheatreTags(theatreId)).toEqual(
      stored?.description === "#Horror" ? ["horror"]
        : stored?.description === "#Drama" ? ["drama"] : ["2026", "comedy"],
    );
  });

  it("enforces text-key uniqueness and restrictive tag references, cascading only theatre deletion", async () => {
    await patch({ description: "#Horror" });
    await expect(fixture.db.insert(tags).values({ name: "horror" })).rejects.toThrow();
    await expect(fixture.db.insert(theatreTags).values({ theatreId, tag: "horror" })).rejects.toThrow();
    await expect(fixture.db.insert(theatreTags).values({ theatreId, tag: "missing" })).rejects.toThrow();
    await expect(fixture.db.update(tags).set({ name: "comedy" }).where(eq(tags.name, "horror"))).rejects.toThrow();
    await expect(fixture.db.delete(tags).where(eq(tags.name, "horror"))).rejects.toThrow();
    await fixture.db.delete(theatres).where(eq(theatres.id, theatreId));
    expect(await fixture.db.select().from(theatreTags)).toEqual([]);
    expect(await fixture.db.select().from(tags)).toEqual([{ name: "horror" }]);
    const indexes = await fixture.db.execute(sql`
      SELECT indexdef FROM pg_indexes WHERE tablename = 'theatre_tags'
    `);
    expect(indexes.rows.map(({ indexdef }) => indexdef).join("\n")).toContain("(tag, theatre_id)");
  });
});
