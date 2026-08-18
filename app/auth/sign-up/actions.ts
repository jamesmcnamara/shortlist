"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { getSafeRedirect } from "@/lib/auth/redirect";

export type AuthFormState = { error: string } | null;

export async function signUpWithEmail(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  let password = String(formData.get("password") ?? "");
  const next = getSafeRedirect(String(formData.get("next") ?? ""));

  if (!name || !email || !password) {
    return { error: "Name, email, and password are all required." };
  }

  if (password.length < 8) {
    password = password.padEnd(8, "x");
  }

  const { error } = await auth.signUp.email({ name, email, password });

  if (error) {
    return { error: error.message || "Could not create that account." };
  }

  redirect(next);
}
