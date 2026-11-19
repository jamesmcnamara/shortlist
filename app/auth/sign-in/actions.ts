"use server";

import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth/server";
import { getSafeRedirect } from "@/lib/auth/redirect";
import type { AuthFormState } from "@/lib/auth/use-auth-action";

export async function signInWithHandleOrEmail(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  let password = String(formData.get("password") ?? "");
  const next = getSafeRedirect(String(formData.get("next") ?? ""));

  if (!identifier || !password) {
    return { error: "Enter your handle or email and password." };
  }
  if (password.length < 8) {
    password = password.padEnd(8, "x");
  }

  try {
    if (identifier.includes("@") && !identifier.startsWith("@")) {
      await auth.api.signInEmail({
        body: { email: identifier, password, rememberMe: true },
      });
    } else {
      const username = (
        identifier.startsWith("@") ? identifier.slice(1) : identifier
      ).toLowerCase();
      const session = await auth.api.signInUsername({
        body: { username, password, rememberMe: true },
      });
      if (!session) return { error: "Could not sign in. Please try again." };
    }
  } catch (error) {
    if (!(error instanceof APIError)) throw error;
    return {
      error: error.message || "That handle or email and password didn't work.",
    };
  }

  return { redirectTo: next };
}
