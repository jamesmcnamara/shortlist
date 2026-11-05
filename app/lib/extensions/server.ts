import {
  hasExtension,
  isExtension,
  type ExtensionName,
} from "@/app/lib/extensions";
import {
  withTheatreAdmin,
  withTheatreMember,
  type RouteContext,
  type TheatreContext,
} from "@/lib/auth/require-theatre";
import { specific } from "./specific/handler";

export interface ExtensionHandler {
  access: "member" | "admin";
  error: string;
  handle: (request: Request, context: TheatreContext) => Promise<Response>;
}

const HANDLERS: Record<ExtensionName, ExtensionHandler> = { specific };

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
