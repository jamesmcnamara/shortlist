"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

export type AuthFormState = { error: string } | null;

export async function signUpWithEmail(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!name || !email || !password) {
    return { error: "Name, email, and password are all required." };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const { error } = await auth.signUp.email({ name, email, password });

  if (error) {
    return { error: error.message || "Could not create that account." };
  }

  redirect("/");
}
