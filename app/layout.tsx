import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shortlist",
  description: "Keep track of what to watch next.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
