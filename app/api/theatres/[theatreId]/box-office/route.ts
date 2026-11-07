import { z } from "zod";
import {
  refreshBoxOffice,
  saveManualBudget,
} from "@/app/lib/enrich-box-office";
import { withTheatreUser } from "@/lib/auth/require-theatre";
import { badRequest, dbId, parseJson } from "@/lib/validation";

export const runtime = "nodejs";

const refreshBody = z.object({ movieId: dbId("A movie id is required.") });
const manualBudgetBody = refreshBody.extend({
  budget: z
    .int("Enter a budget in whole US dollars.")
    .nonnegative("Budget cannot be negative."),
});

export const PATCH = withTheatreUser({
  error: "Unable to save budget.",
})(async (request, { theatre }) => {
  const parsed = await parseJson(request, manualBudgetBody);
  if (!parsed.success) return badRequest(parsed.error);
  const result = await saveManualBudget(
    parsed.data.movieId,
    theatre.id,
    parsed.data.budget,
  );
  if (result.status === "not_found") {
    return Response.json(
      { error: "That movie is not on this list." },
      { status: 404 },
    );
  }
  return new Response(null, { status: 204 });
});

export const POST = withTheatreUser({
  error: "Unable to refresh Box Office Mojo.",
})(async (request, { theatre }) => {
  const parsed = await parseJson(request, refreshBody);
  if (!parsed.success) return badRequest(parsed.error);

  try {
    const result = await refreshBoxOffice(parsed.data.movieId, theatre.id);
    if (result.status === "not_found") {
      return Response.json(
        { error: "That movie is not on this list." },
        { status: 404 },
      );
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
