import { listNominations } from "@/app/lib/queries";
import { withPublicTheatre } from "@/lib/auth/require-theatre";

export const runtime = "nodejs";

export const GET = withPublicTheatre({
  error: "Unable to load the theatre.",
})(async (_, { theatre }) =>
  Response.json({
    theatre: { name: theatre.name },
    nominations: await listNominations(theatre.id),
  }),
);
