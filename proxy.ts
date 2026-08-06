import { auth } from "@/lib/auth/server";

export default auth.middleware({
  loginUrl: "/auth/sign-in"
});

// Only page routes are matched. API routes enforce auth themselves via
// requireUserId() so they return 401 JSON instead of an HTML redirect.
export const config = {
  matcher: ["/"]
};
