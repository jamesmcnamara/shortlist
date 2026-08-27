import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Shortlist",
    short_name: "Shortlist",
    description: "Keep track of what to watch next.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f1e9",
    theme_color: "#3f7893",
    icons: [
      {
        src: "/icons/icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
      },
      {
        src: "/icons/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
