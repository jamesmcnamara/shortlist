import { z } from "zod";
import { refreshBoxOffice } from "@/app/lib/enrich-box-office";
import { withTheatreMember } from "@/lib/auth/require-theatre";
import { badRequest, dbId, parseJson } from "@/lib/validation";

export const runtime = "nodejs";

const refreshBody = z.object({ movieId: dbId("A movie id is required.") });

export const POST = withTheatreMember({
  error: "Unable to refresh Box Office Mojo.",
})(async (request, { theatre }) => {
  const parsed = await parseJson(request, refreshBody);
  if (!parsed.success) return badRequest(parsed.error);

  try {
    const result = await refreshBoxOffice(parsed.data.movieId, theatre.id);
    if (result.status === "not_found") {
      return Response.json({ error: "That movie is not on this list." }, { status: 404 });
    }
    if (result.status === "missing_imdb") {
      return Response.json(
        { error: "This movie has no IMDb ID for Box Office Mojo." },
        { status: 400 },
      );
    }
    return Response.json(result.boxOffice);
  } catch (error) {
    console.error("Unable to refresh Box Office Mojo.", error);
    return Response.json(
      { error: "Couldn't refresh Box Office Mojo. Try again." },
      { status: 502 },
    );
  }
});
