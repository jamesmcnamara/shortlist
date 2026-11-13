import {
  EXTENSIONS,
  hasExtension,
  isExtension,
  type ExtensionName,
} from "@/app/lib/extensions";
import {
  withTheatreAdmin,
  withTheatreMember,
  type RouteContext,
  type SafeTheatre,
  type TheatreContext,
} from "@/lib/auth/require-theatre";
import type { Nomination } from "@/src/db/schema";
import { movieclub } from "./movieclub/handler";
import { specific } from "./specific/handler";

/**
 * How an extension takes part in the nominations routes, which don't know about
 * any one extension. Hooks only run on lists tagged with the extension.
 */
export interface ExtensionHooks {
  /** Why this user can't nominate right now, or null to allow it. */
  beforeNominate?: (context: {
    theatre: SafeTheatre;
    userId: string;
  }) => Promise<string | null>;
  /** Adds the extension's data to the nominations a list shows. */
  decorate?: (
    theatre: SafeTheatre,
    nominations: Nomination[],
  ) => Promise<Nomination[]>;
}

export interface ExtensionHandler {
  access: "member" | "admin";
  error: string;
  handle: (request: Request, context: TheatreContext) => Promise<Response>;
  hooks?: ExtensionHooks;
}

const HANDLERS: Record<ExtensionName, ExtensionHandler> = {
  specific,
  movieclub,
};

const hooksFor = (theatre: SafeTheatre) =>
  EXTENSIONS.filter((name) => hasExtension(name, theatre.description)).flatMap(
    (name) => HANDLERS[name].hooks ?? [],
  );

/** The reason an extension won't let this user nominate right now, if any. */
export async function refuseNomination(
  theatre: SafeTheatre,
  userId: string,
): Promise<string | null> {
  const reasons = await Promise.all(
    hooksFor(theatre).map(
      (hooks) => hooks.beforeNominate?.({ theatre, userId }) ?? null,
    ),
  );
  return reasons.find(Boolean) ?? null;
}

/** The list's nominations with each active extension's data added. */
export const decorateNominations = (
  theatre: SafeTheatre,
  nominations: Nomination[],
) =>
  hooksFor(theatre).reduce(
    async (list, hooks) =>
      hooks.decorate ? hooks.decorate(theatre, await list) : list,
    Promise.resolve(nominations),
  );

/**
 * Runs the extension named in the URL, after the usual theatre access checks,
 * and only on lists tagged with its name.
 */
export async function runExtension(
  request: Request,
  routeContext: RouteContext,
): Promise<Response> {
  const { extension } = await routeContext.params;
  if (!isExtension(extension)) {
    return Response.json(
      { error: "That extension does not exist." },
      { status: 404 },
    );
  }

  const { access, error, handle } = HANDLERS[extension];
  const guard = access === "admin" ? withTheatreAdmin : withTheatreMember;
  return guard({ error })(async (request, context) =>
    hasExtension(extension, context.theatre.description)
      ? handle(request, context)
      : Response.json(
          { error: `That only works on lists tagged #${extension}.` },
          { status: 400 },
        ),
  )(request, routeContext);
}
