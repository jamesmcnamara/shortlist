"use server";

import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth/server";
import { getSafeRedirect } from "@/lib/auth/redirect";
import type { AuthFormState } from "@/lib/auth/use-auth-action";
import { HANDLE_PATTERN } from "@/lib/user-path";

export async function signUpWithEmail(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();
  let password = String(formData.get("password") ?? "");
  const next = getSafeRedirect(String(formData.get("next") ?? ""));

  if (!name || !email || !password) {
    return { error: "Name, email, and password are all required." };
  }
  if (!HANDLE_PATTERN.test(username)) {
    return {
      error:
        "Choose a handle of 3-30 letters, numbers, or hyphens, starting and ending with a letter or number.",
    };
  }

  if (password.length < 8) {
    password = password.padEnd(8, "x");
  }

  try {
    await auth.api.signUpEmail({ body: { name, email, password, username } });
  } catch (error) {
    if (!(error instanceof APIError)) throw error;
    return { error: error.message || "Could not create that account." };
  }

  return { redirectTo: next };
}
