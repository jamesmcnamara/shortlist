import { and, eq } from 'drizzle-orm';
import { getDb } from '@/src/db/client';
import { roomMembers, rooms, type Room, type RoomRole } from '@/src/db/schema';
import { requireUserId, unauthorized } from './require-user';

/**
 * The invite code is a capability, so it is never part of the room object that
 * gets handed to members or serialized into a page. Admin routes read it
 * explicitly via `findInviteCode`.
 */
export type SafeRoom = Omit<Room, 'inviteCode'>;

const ROOM_COLUMNS = {
  id: rooms.id,
  slug: rooms.slug,
  name: rooms.name,
  createdBy: rooms.createdBy,
  nominationsPerCycle: rooms.nominationsPerCycle,
  votesPerCycle: rooms.votesPerCycle,
  cycleLength: rooms.cycleLength,
  allowSelfVote: rooms.allowSelfVote,
  allowDuplicateNominations: rooms.allowDuplicateNominations,
  createdAt: rooms.createdAt
};

export interface RoomContext {
  userId: string;
  room: SafeRoom;
  role: RoomRole;
  params: Record<string, string>;
}

/** Route params are async in Next 15+. */
type RouteContext = { params: Promise<Record<string, string>> };

type RoomHandler = (
  request: Request,
  context: RoomContext
) => Promise<Response>;

interface WithRoomConfig {
  error: string;
}

export const notFound = () =>
  Response.json({ error: 'That room does not exist.' }, { status: 404 });

export const forbidden = (message = 'You are not a member of this room.') =>
  Response.json({ error: message }, { status: 403 });

export async function findRoomBySlug(slug: string): Promise<SafeRoom | null> {
  const [room] = await getDb()
    .select(ROOM_COLUMNS)
    .from(rooms)
    .where(eq(rooms.slug, slug))
    .limit(1);
  return (room as SafeRoom) ?? null;
}

/** Read separately, and only where an admin has been established. */
export async function findInviteCode(roomId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ inviteCode: rooms.inviteCode })
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);
  return row?.inviteCode ?? null;
}

export async function findMembership(
  roomId: string,
  userId: string
): Promise<RoomRole | null> {
  const [membership] = await getDb()
    .select({ role: roomMembers.role })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)))
    .limit(1);
  return (membership?.role as RoomRole) ?? null;
}

/**
 * Resolves the room from the route slug and asserts membership before the
 * handler runs. Every room-scoped route goes through here, so a handler can
 * never see a room the caller does not belong to.
 */
export function withRoomMember(config?: WithRoomConfig) {
  return (handler: RoomHandler) =>
    withResolvedRoom(config, handler, () => null);
}

/** As `withRoomMember`, but additionally requires the `admin` role. */
export function withRoomAdmin(config?: WithRoomConfig) {
  return (handler: RoomHandler) =>
    withResolvedRoom(config, handler, (role) =>
      role === 'admin' ? null : forbidden('Only room admins can do that.')
    );
}

const withResolvedRoom =
  (
    config: WithRoomConfig | undefined,
    handler: RoomHandler,
    check: (role: RoomRole) => Response | null
  ) =>
  async (request: Request, routeContext: RouteContext): Promise<Response> => {
    const userId = await requireUserId();
    if (!userId) return unauthorized();

    try {
      const params = await routeContext.params;
      const room = await findRoomBySlug(params.slug);
      // Non-members get the same 404 as a nonexistent room, so room slugs
      // cannot be probed for existence.
      if (!room) return notFound();

      const role = await findMembership(room.id, userId);
      if (!role) return notFound();

      const rejection = check(role);
      if (rejection) return rejection;

      return await handler(request, { userId, room, role, params });
    } catch (error) {
      console.error(error);
      return Response.json(
        { error: config?.error ?? 'An unexpected error occurred.' },
        { status: 500 }
      );
    }
  };
