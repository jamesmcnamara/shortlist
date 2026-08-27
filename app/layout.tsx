import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shortlist",
  description: "Keep track of what to watch next.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Shortlist",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#3f7893",
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
