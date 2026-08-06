import { requireUserId, unauthorized } from "@/lib/auth/require-user";
import { movieApi } from "../../../src/api";

export const runtime = "nodejs";

async function handle(request: Request) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  return movieApi(request);
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

export async function DELETE(request: Request) {
  return handle(request);
}
