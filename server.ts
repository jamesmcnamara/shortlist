import { movieApi } from "./src/api";

const index = await Bun.file("index.html").text();

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/api/movies") {
      return movieApi(request);
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(index, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    return new Response("Not found", { status: 404 });
  }
});

console.log(`Shortlist running at ${server.url}`);
