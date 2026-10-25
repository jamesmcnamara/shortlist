import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/auth/require-user";
import { userPath } from "@/lib/user-path";

export default async function Theatres() {
  const userId = await requireUserId();
  redirect(userId ? userPath(userId) : "/auth/sign-in");
}
