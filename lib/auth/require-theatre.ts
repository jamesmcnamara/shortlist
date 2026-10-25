import { and, eq, or } from "drizzle-orm";
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
 * gets handed to members or serialized into a page. Routes read codes
 * explicitly after checking membership or admin access.
 */
export type SafeTheatre = Omit<
  Theatre,
  "inviteCode" | "adminInviteCode"
> & {
  path: string;
};

const THEATRE_COLUMNS = {
  id: theatres.id,
  name: theatres.name,
  createdBy: theatres.createdBy,
  watchlistFor: theatres.watchlistFor,
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

export async function findTheatreByInviteCode(
  code: string,
): Promise<{ theatre: SafeTheatre; role: TheatreRole } | null> {
  const [row] = await getDb()
    .select({ ...THEATRE_COLUMNS, adminInviteCode: theatres.adminInviteCode })
    .from(theatres)
    .where(or(eq(theatres.inviteCode, code), eq(theatres.adminInviteCode, code)))
    .limit(1);
  if (!row) return null;
  const { adminInviteCode, ...theatre } = row;
  return {
    theatre: { ...theatre, path: theatrePath(theatre) },
    role: adminInviteCode === code ? "admin" : "member",
  };
}

/** Read separately, and only where membership has been established. */
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

export interface PublicTheatreContext {
  theatre: SafeTheatre;
  params: Record<string, string>;
}

export interface TheatreViewerContext extends PublicTheatreContext {
  userId: string | null;
  role: TheatreRole | null;
}

export interface TheatreUserContext extends PublicTheatreContext {
  userId: string;
}

type TheatreViewerHandler = (
  request: Request,
  context: TheatreViewerContext,
) => Promise<Response>;

type TheatreUserHandler = (
  request: Request,
  context: TheatreUserContext,
) => Promise<Response>;

/** Resolves a public list by ID and includes membership only for the viewer. */
export function withTheatreViewer(config: WithTheatreConfig) {
  return (handler: TheatreViewerHandler) =>
    async (request: Request, routeContext: RouteContext): Promise<Response> =>
      catchErrors(config, async () => {
        const params = await routeContext.params;
        const theatreId = params.theatreId;
        if (!theatreId || !isUuid(theatreId)) return notFound();
        const theatre = await findTheatreById(theatreId);
        if (!theatre) return notFound();
        const userId = await requireUserId();
        const role = userId ? await findMembership(theatre.id, userId) : null;
        return handler(request, { theatre, userId, role, params });
      });
}

/** Resolves a list for any signed-in user, without requiring membership. */
export function withTheatreUser(config: WithTheatreConfig) {
  return (handler: TheatreUserHandler) =>
    async (request: Request, routeContext: RouteContext): Promise<Response> => {
      const userId = await requireUserId();
      if (!userId) return unauthorized();
      return catchErrors(config, async () => {
        const params = await routeContext.params;
        const theatreId = params.theatreId;
        if (!theatreId || !isUuid(theatreId)) return notFound();
        const theatre = await findTheatreById(theatreId);
        if (!theatre) return notFound();
        return handler(request, { theatre, userId, params });
      });
    };
}

/**
 * Resolves the theatre from an invite code, with no sign-in required. Handlers
 * behind this must only ever read.
 */
export function withPublicTheatre(config: WithTheatreConfig) {
  return (
      handler: (
        request: Request,
        context: PublicTheatreContext,
      ) => Promise<Response>,
    ) =>
    (request: Request, routeContext: RouteContext): Promise<Response> =>
      catchErrors(config, async () => {
        const params = await routeContext.params;
        const code = params.code;
        if (!code) return notFound();
        const resolved = await findTheatreByInviteCode(code);
        if (!resolved) return notFound();
        return handler(request, { theatre: resolved.theatre, params });
      });
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

    return catchErrors(config, async () => {
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

      return handler(request, { userId, theatre, role, params });
    });
  };

async function catchErrors(
  config: WithTheatreConfig,
  run: () => Promise<Response>,
): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: config?.error ?? "An unexpected error occurred." },
      { status: 500 },
    );
  }
}
