import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Only checks that a session cookie exists; pages and API routes still
// validate the session itself.
export default function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  const signIn = new URL("/auth/sign-in", request.url);
  signIn.searchParams.set("next", pathname + search);
  return NextResponse.redirect(signIn);
}

// Only page routes are matched. API routes enforce auth themselves via
// requireUserId() so they return 401 JSON instead of an HTML redirect.
// /join/[code] is excluded: it's a client component that calls the join API
// itself and redirects to sign-up with a `next` back to the invite link on
// 401, which the middleware would short-circuit before that logic runs.
export const config = {
  matcher: ["/", "/r/:path*", "/rooms/:path*"],
};
