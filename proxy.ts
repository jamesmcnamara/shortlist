import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Only checks that a session cookie exists; pages and API routes still
// validate the session itself.
export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  // Layouts don't receive search params or the nested page's path.
  requestHeaders.set("x-shortlist-user-route", pathname + search);
  const requiresSession =
    pathname === "/" ||
    pathname === "/theatres/new" ||
    /^\/u\/[^/]+\/[^/]+\/settings\/?$/.test(pathname);
  if (!requiresSession || getSessionCookie(request))
    return NextResponse.next({ request: { headers: requestHeaders } });

  const signIn = new URL("/auth/sign-in", request.url);
  signIn.searchParams.set("next", pathname + search);
  return NextResponse.redirect(signIn);
}

// Only page routes are matched. API routes enforce auth themselves via
// requireUserId() so they return 401 JSON instead of an HTML redirect.
// User routes also forward their path for username redirects in the layout.
// Profiles and ordinary theatre pages are public; settings and creation still
// require a session. /join/[code] also supports public previews.
// /compare is public too and must stay out of the matcher.
export const config = {
  matcher: ["/", "/theatres/new", "/u/:path*"],
};
