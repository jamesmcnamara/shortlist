import { auth } from "@/lib/auth/server";

export default auth.middleware({
  loginUrl: "/auth/sign-in",
});

// Only page routes are matched. API routes enforce auth themselves via
// requireUserId() so they return 401 JSON instead of an HTML redirect.
// /join/[code] is excluded: it's a client component that calls the join API
// itself and redirects to sign-up with a `next` back to the invite link on
// 401, which the middleware would short-circuit before that logic runs.
export const config = {
  matcher: ["/", "/r/:path*", "/rooms/:path*"],
};
