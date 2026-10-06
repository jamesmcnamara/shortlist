import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DataProvider } from "./lib/data/DataProvider";
import { MotionProvider } from "./components/MotionProvider";

export const metadata: Metadata = {
  title: "Shortlist",
  description: "Keep track of what to watch next.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-512.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Shortlist",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#386d87",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <MotionProvider>
          <DataProvider>{children}</DataProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
