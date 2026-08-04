import type { VercelRequest, VercelResponse } from "@vercel/node";
import { movieApi } from "../src/api";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const body = req.method === "POST" ? JSON.stringify(req.body ?? {}) : undefined;
  const request = new Request(`https://${req.headers.host ?? "localhost"}${req.url ?? "/api/movies"}`, {
    method: req.method,
    headers: { "content-type": "application/json" },
    body
  });
  const response = await movieApi(request);

  res.status(response.status);
  response.headers.forEach((value, key) => res.setHeader(key, value));
  if (response.status === 204) {
    return res.end();
  }
  return res.send(await response.json());
}
