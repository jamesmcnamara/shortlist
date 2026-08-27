import withSerwistInit from "@serwist/next";
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
    turbopack: {},
  });
}
