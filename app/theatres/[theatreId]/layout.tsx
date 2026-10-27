import { notFound } from "next/navigation";
import { isUuid } from "@/lib/theatre-path";
import { TheatreProvider } from "./TheatreContext";

interface TheatreLayoutProps {
  children: React.ReactNode;
  params: Promise<{ theatreId: string }>;
}

export default async function TheatreLayout({
  children,
  params,
}: TheatreLayoutProps) {
  const { theatreId } = await params;
  if (!isUuid(theatreId)) notFound();

  return <TheatreProvider theatreId={theatreId}>{children}</TheatreProvider>;
}
