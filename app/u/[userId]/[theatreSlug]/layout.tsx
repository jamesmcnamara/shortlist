import { notFound } from "next/navigation";
import { resolveNamedTheatre } from "@/lib/named-routes";
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
  if (!theatre) notFound();
  return <TheatreProvider theatreId={theatre.id}>{children}</TheatreProvider>;
}
