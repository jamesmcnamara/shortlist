import { runExtension } from "@/app/lib/extensions/server";

export const runtime = "nodejs";
// Room for one model call (30s cap) plus a few movie lookups.
export const maxDuration = 60;

export const POST = runExtension;
