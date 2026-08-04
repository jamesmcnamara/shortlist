import { movieApi } from "../../../src/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return movieApi(request);
}

export async function POST(request: Request) {
  return movieApi(request);
}

export async function DELETE(request: Request) {
  return movieApi(request);
}
