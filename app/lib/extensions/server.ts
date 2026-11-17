import { inArray } from "drizzle-orm";
import {
  EXTENSIONS,
  extensionTags,
  hasExtension,
  isExtension,
  type ExtensionName,
} from "@/app/lib/extensions";
import {
  findTheatreById,
  withTheatreAdmin,
  withTheatreMember,
  type RouteContext,
  type SafeTheatre,
  type TheatreContext,
} from "@/lib/auth/require-theatre";
import { getDb } from "@/src/db/client";
import {
  theatreTags,
  type Nomination,
  type RawNomination,
} from "@/src/db/schema";
import { movieclub } from "./movieclub/handler";
import { specific } from "./specific/handler";

export interface NominationChange {
  before?: RawNomination;
  after?: RawNomination;
}

/**
 * How an extension takes part in the nominations routes and the daily cron,
 * which don't know about any one extension. Hooks only run on lists tagged
 * with the extension.
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
  /** Receives the nomination before and after a saved change; null means absent. */
  afterNominationChange?: (
    context: NominationChange & { theatre: SafeTheatre; userId: string },
  ) => Promise<void>;
  /** Runs once a day, in the early evening Pacific. */
  daily?: (context: { theatre: SafeTheatre; now: Date }) => Promise<void>;
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

/** Lets extensions react to a change. The change is already saved, so hook failures are only logged. */
export async function nominationChanged(
  theatre: SafeTheatre,
  userId: string,
  change: NominationChange,
) {
  await Promise.all(
    hooksFor(theatre).map(async (hooks) => {
      try {
        await hooks.afterNominationChange?.({ theatre, userId, ...change });
      } catch (error) {
        console.error("Unable to run a nomination change hook.", error);
      }
    }),
  );
}

/** Runs every daily hook on each list tagged with its extension. */
export async function runDailyHooks(now: Date) {
  const tags = EXTENSIONS.filter((name) => HANDLERS[name].hooks?.daily).flatMap(
    extensionTags,
  );
  if (!tags.length) return;
  const tagged = await getDb()
    .selectDistinct({ id: theatreTags.theatreId })
    .from(theatreTags)
    .where(inArray(theatreTags.tag, tags));
  await Promise.all(
    tagged.map(async ({ id }) => {
      try {
        const theatre = await findTheatreById(id);
        if (!theatre) return;
        await Promise.all(
          hooksFor(theatre).map((hooks) => hooks.daily?.({ theatre, now })),
        );
      } catch (error) {
        console.error(`Unable to run daily hooks for list ${id}.`, error);
      }
    }),
  );
}

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
