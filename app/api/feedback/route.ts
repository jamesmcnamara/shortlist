import { z } from "zod";
import { withUser } from "@/lib/auth/require-user";
import { badRequest, parseJson, requiredText } from "@/lib/validation";
import { getDb } from "@/src/db/client";
import { feedback, type FeedbackCategory } from "@/src/db/schema";

export const runtime = "nodejs";

const CATEGORIES = [
  "bug",
  "feature",
  "design",
  "copy",
  "other",
] as const satisfies FeedbackCategory[];

const feedbackBody = z.object({
  message: requiredText("Feedback message is required."),
  // An unrecognized category shouldn't lose the feedback itself.
  category: z.enum(CATEGORIES).nullable().catch(null),
});

/** Any kind of feedback is welcome, so the only required field is the message. */
export const POST = withUser({ error: "Unable to submit feedback." })(async (
  request: Request,
  userId: string,
) => {
  const parsed = await parseJson(request, feedbackBody);
  if (!parsed.success) return badRequest(parsed.error);
  const { message, category } = parsed.data;

  const [row] = await getDb()
    .insert(feedback)
    .values({ userId, message, category })
    .returning();

  return Response.json(row, { status: 201 });
});
