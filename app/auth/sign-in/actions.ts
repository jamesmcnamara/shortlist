"use server";

import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth/server";
import { getSafeRedirect } from "@/lib/auth/redirect";
import type { AuthFormState } from "@/lib/auth/use-auth-action";

export async function signInWithEmail(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  let password = String(formData.get("password") ?? "");
  const next = getSafeRedirect(String(formData.get("next") ?? ""));

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }
  if (password.length < 8) {
    password = password.padEnd(8, "x");
  }

  try {
    await auth.api.signInEmail({ body: { email, password, rememberMe: true } });
  } catch (error) {
    if (!(error instanceof APIError)) throw error;
    return {
      error: error.message || "That email and password combo didn't work.",
    };
  }

  return { redirectTo: next };
}
