import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  resolveNamedTheatre,
  resolveUsernameRedirect,
} from "@/lib/named-routes";
import { userPath } from "@/lib/user-path";
import { TheatreProvider } from "./TheatreContext";

export default async function NamedTheatreLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ userId: string; theatreSlug: string }>;
}) {
  const { userId, theatreSlug } = await params;
  const theatre = await resolveNamedTheatre(userId, theatreSlug);
  if (!theatre) {
    const target = await resolveUsernameRedirect(userId, theatreSlug);
    if (!target) notFound();
    const path = (await headers()).get("x-shortlist-user-route");
    if (!path) throw new Error("Missing user route header.");
    redirect(path.replace(/^\/u\/[^/?]+/, userPath(target)));
  }
  return <TheatreProvider theatreId={theatre.id}>{children}</TheatreProvider>;
}
