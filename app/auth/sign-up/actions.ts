"use server";

import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth/server";
import { getSafeRedirect } from "@/lib/auth/redirect";
import { createPlaceholderEmail } from "@/lib/auth/placeholder-email";
import type { AuthFormState } from "@/lib/auth/use-auth-action";
import { HANDLE_PATTERN } from "@/lib/user-path";

export async function signUpWithHandle(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const handle = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();
  const username = handle.startsWith("@") ? handle.slice(1) : handle;
  let password = String(formData.get("password") ?? "");
  const next = getSafeRedirect(String(formData.get("next") ?? ""));

  if (!username || !password) {
    return { error: "Enter a handle and password." };
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
    await auth.api.signUpEmail({
      body: {
        name: username,
        email: createPlaceholderEmail(),
        password,
        username,
      },
    });
  } catch (error) {
    if (!(error instanceof APIError)) throw error;
    return { error: error.message || "Could not create that account." };
  }

  return { redirectTo: next };
}
