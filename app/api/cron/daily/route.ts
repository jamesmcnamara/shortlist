import { createHash, timingSafeEqual } from "node:crypto";
import { runDailyHooks } from "@/app/lib/extensions/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const digest = (text: string) => createHash("sha256").update(text).digest();

/** Vercel Cron calls this once a day with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json(
      { error: "The daily job is not configured." },
      { status: 503 },
    );
  }
  const authorization = request.headers.get("authorization") ?? "";
  if (!timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`))) {
    return Response.json({ error: "Not authorized." }, { status: 401 });
  }
  await runDailyHooks(new Date());
  return new Response(null, { status: 204 });
}
