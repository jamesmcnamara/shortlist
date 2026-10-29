import withSerwistInit from "@serwist/next";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import type { NextConfig } from "next";

export default function nextConfig(phase: string): NextConfig {
  const withSerwist = withSerwistInit({
    disable: phase !== PHASE_PRODUCTION_BUILD,
    swSrc: "app/sw.ts",
    swDest: "public/sw.js",
    register: true,
    reloadOnOnline: false,
    globPublicPatterns: ["icons/**/*"],
  });

  return withSerwist({
    env: {
      // Versions the data URL, so a refreshed bundle never reads an older cached copy.
      OSCARS_DATA_VERSION: createHash("sha256")
        .update(readFileSync("public/data/oscars.json"))
        .digest("hex")
        .slice(0, 16),
    },
    turbopack: {},
    experimental: {
      turbopackFileSystemCacheForDev: false,
    },
    allowedDevOrigins: ["p0wd43vp2t.local"],
    async headers() {
      return [
        {
          source: "/data/oscars.json",
          headers: [
            {
              key: "Cache-Control",
              value: "public, max-age=31536000, immutable",
            },
          ],
        },
      ];
    },
    async redirects() {
      return [
        {
          source: "/rooms",
          destination: "/theatres",
          permanent: false,
        },
        {
          source: "/rooms/:path*",
          destination: "/theatres/:path*",
          permanent: false,
        },
        {
          source: "/api/rooms",
          destination: "/api/theatres",
          permanent: false,
        },
        {
          source: "/api/rooms/:path*",
          destination: "/api/theatres/:path*",
          permanent: false,
        },
      ];
    },
  });
}
