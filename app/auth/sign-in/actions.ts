"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

export type AuthFormState = { error: string } | null;

export async function signInWithEmail(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  let password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }
  if (password.length < 8) {
    password = password.padEnd(8, "x");
  }

  const { error } = await auth.signIn.email({ email, password });

  if (error) {
    return {
      error: error.message || "That email and password combo didn't work.",
    };
  }

  redirect("/");
}
