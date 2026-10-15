import { and, eq } from "drizzle-orm";
import { isUuid, theatrePath } from "@/lib/theatre-path";
import { getDb } from "@/src/db/client";
import {
  theatreMembers,
  theatres,
  type Theatre,
  type TheatreRole,
} from "@/src/db/schema";
import { requireUserId, unauthorized } from "./require-user";

/**
 * The invite code is a capability, so it is never part of the theatre object that
 * gets handed to members or serialized into a page. Admin routes read it
 * explicitly via `findInviteCode`.
 */
export type SafeTheatre = Omit<Theatre, "inviteCode" | "adminInviteCode"> & {
  path: string;
};

const THEATRE_COLUMNS = {
  id: theatres.id,
  name: theatres.name,
  watchlistFor: theatres.watchlistFor,
  createdBy: theatres.createdBy,
  description: theatres.description,
  createdAt: theatres.createdAt,
};

export interface TheatreContext {
  userId: string;
  theatre: SafeTheatre;
  role: TheatreRole;
  params: Record<string, string>;
}

/** Route params are async in Next 15+. */
type RouteContext = { params: Promise<Record<string, string>> };

type TheatreHandler = (
  request: Request,
  context: TheatreContext,
) => Promise<Response>;

interface WithTheatreConfig {
  error: string;
}

export const notFound = () =>
  Response.json({ error: "That theatre does not exist." }, { status: 404 });

export const forbidden = (message = "You are not a member of this theatre.") =>
  Response.json({ error: message }, { status: 403 });

export async function findTheatreById(
  theatreId: string,
): Promise<SafeTheatre | null> {
  const [theatre] = await getDb()
    .select(THEATRE_COLUMNS)
    .from(theatres)
    .where(eq(theatres.id, theatreId))
    .limit(1);
  return theatre ? { ...theatre, path: theatrePath(theatre) } : null;
}

/** Read separately, and only where an admin has been established. */
export async function findInviteCode(
  theatreId: string,
): Promise<string | null> {
  const [row] = await getDb()
    .select({ inviteCode: theatres.inviteCode })
    .from(theatres)
    .where(eq(theatres.id, theatreId))
    .limit(1);
  return row?.inviteCode ?? null;
}

/** As `findInviteCode`, but for the link that grants the admin role. */
export async function findAdminInviteCode(
  theatreId: string,
): Promise<string | null> {
  const [row] = await getDb()
    .select({ adminInviteCode: theatres.adminInviteCode })
    .from(theatres)
    .where(eq(theatres.id, theatreId))
    .limit(1);
  return row?.adminInviteCode ?? null;
}

export async function findMembership(
  theatreId: string,
  userId: string,
): Promise<TheatreRole | null> {
  const [membership] = await getDb()
    .select({ role: theatreMembers.role })
    .from(theatreMembers)
    .where(
      and(
        eq(theatreMembers.theatreId, theatreId),
        eq(theatreMembers.userId, userId),
      ),
    )
    .limit(1);
  return (membership?.role as TheatreRole) ?? null;
}

/**
 * Resolves the theatre from its ID and asserts membership before the
 * handler runs. Every theatre-scoped route goes through here, so a handler can
 * never see a theatre the caller does not belong to.
 */
export function withTheatreMember(config: WithTheatreConfig) {
  return (handler: TheatreHandler) =>
    withResolvedTheatre(config, handler, () => null);
}

/** As `withTheatreMember`, but additionally requires the `admin` role. */
export function withTheatreAdmin(config: WithTheatreConfig) {
  return (handler: TheatreHandler) =>
    withResolvedTheatre(config, handler, (role) =>
      role === "admin" ? null : forbidden("Only theatre admins can do that."),
    );
}

const withResolvedTheatre =
  (
    config: WithTheatreConfig,
    handler: TheatreHandler,
    check: (role: TheatreRole) => Response | null,
  ) =>
  async (request: Request, routeContext: RouteContext): Promise<Response> => {
    const userId = await requireUserId();
    if (!userId) return unauthorized();

    try {
      const params = await routeContext.params;
      const theatreId = params.theatreId;
      if (!theatreId || !isUuid(theatreId)) return notFound();
      const theatre = await findTheatreById(theatreId);
      // Non-members get the same 404 as nonexistent theatres, so IDs cannot be probed.
      if (!theatre) return notFound();

      const role = await findMembership(theatre.id, userId);
      if (!role) return notFound();

      const rejection = check(role);
      if (rejection) return rejection;

      return await handler(request, { userId, theatre, role, params });
    } catch (error) {
      console.error(error);
      return Response.json(
        { error: config?.error ?? "An unexpected error occurred." },
        { status: 500 },
      );
    }
  };
