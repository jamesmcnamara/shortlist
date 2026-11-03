import { z } from "zod";
import { refreshWikipedia } from "@/app/lib/enrich-wikipedia";
import { withTheatreUser } from "@/lib/auth/require-theatre";
import { badRequest, dbId, parseJson } from "@/lib/validation";

export const runtime = "nodejs";

const refreshBody = z.object({ movieId: dbId("A movie id is required.") });

export const POST = withTheatreUser({
  error: "Unable to save Wikipedia article.",
})(async (request, { theatre }) => {
  const parsed = await parseJson(request, refreshBody);
  if (!parsed.success) return badRequest(parsed.error);
  const result = await refreshWikipedia(parsed.data.movieId, theatre.id);
  if (result.status === "not_found") {
    return Response.json(
      { error: "That movie is not on this list." },
      { status: 404 },
    );
  }
  if (result.status === "missing_tmdb") {
    return Response.json(
      { error: "That movie has no TMDB id." },
      { status: 400 },
    );
  }

  if (result.status === "lookup_failed") {
    return Response.json(
      { error: "Couldn't load Wikipedia article. Try again." },
      { status: 502 },
    );
  }

  if (result.status === "removed") {
    return Response.json(
      { error: "That movie is no longer on this list." },
      { status: 404 },
    );
  }
  return Response.json({ wikipediaUrl: result.wikipediaUrl });
});
