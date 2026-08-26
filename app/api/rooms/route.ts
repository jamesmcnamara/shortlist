import { desc, eq } from "drizzle-orm";
import { withUser } from "@/lib/auth/require-user";
import {
  generateInviteCode,
  isPresetName,
  isValidSlug,
  parseConfigUpdate,
  PRESETS,
  slugify,
} from "@/app/lib/rooms";
import { getDb } from "@/src/db/client";
import { roomMembers, rooms } from "@/src/db/schema";

export const runtime = "nodejs";

/** Rooms the caller belongs to, for the switcher and the landing redirect. */
export const GET = withUser({ error: "Unable to load your rooms." })(async (
  _request: Request,
  userId: string,
) => {
  const memberships = await getDb()
    .select({
      id: rooms.id,
      slug: rooms.slug,
      name: rooms.name,
      cycleLength: rooms.cycleLength,
      nominationsPerCycle: rooms.nominationsPerCycle,
      votesPerCycle: rooms.votesPerCycle,
      role: roomMembers.role,
      joinedAt: roomMembers.joinedAt,
    })
    .from(roomMembers)
    .innerJoin(rooms, eq(rooms.id, roomMembers.roomId))
    .where(eq(roomMembers.userId, userId))
    .orderBy(desc(roomMembers.joinedAt));

  return Response.json(memberships);
});

export const POST = withUser({ error: "Unable to create the room." })(async (
  request: Request,
  userId: string,
) => {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return Response.json(
      { error: "A room name is required." },
      { status: 400 },
    );
  }

  const preset = body?.preset ?? "club";
  if (!isPresetName(preset)) {
    return Response.json(
      { error: "Choose either a movie club or a watch list." },
      { status: 400 },
    );
  }

  const slug =
    typeof body?.slug === "string" && body.slug.trim()
      ? slugify(body.slug)
      : slugify(name);
  if (!isValidSlug(slug)) {
    return Response.json(
      { error: "That name cannot be turned into a URL. Try another." },
      { status: 400 },
    );
  }

  // Overrides let creation and the admin panel share one validation path.
  const overrides = parseConfigUpdate(body?.config);
  if (!overrides.ok) {
    return Response.json({ error: overrides.error }, { status: 400 });
  }

  const db = getDb();
  const [existing] = await db
    .select({ id: rooms.id })
    .from(rooms)
    .where(eq(rooms.slug, slug))
    .limit(1);
  if (existing) {
    return Response.json(
      { error: "A room with that name already exists." },
      { status: 409 },
    );
  }

  const [room] = await db
    .insert(rooms)
    .values({
      slug,
      name,
      createdBy: userId,
      inviteCode: generateInviteCode(),
      ...PRESETS[preset],
      ...overrides.values,
    })
    .returning();

  await db
    .insert(roomMembers)
    .values({ roomId: room.id, userId, role: "admin" });

  // The creator is an admin and can read the code from the settings page; it
  // is withheld here so no response carries it incidentally.
  const { inviteCode: _withheld, ...safe } = room;
  return Response.json(safe, { status: 201 });
});
