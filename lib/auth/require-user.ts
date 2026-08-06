import { auth } from "@/lib/auth/server";

export async function requireUserId(): Promise<string | null> {
  const { data: session } = await auth.getSession();
  return session?.user?.id ?? null;
}

export function unauthorized() {
  return Response.json({ error: "You need to sign in first." }, { status: 401 });
}
