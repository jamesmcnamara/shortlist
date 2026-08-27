import { withUser } from "@/lib/auth/require-user";
import { getDb } from "@/src/db/client";
import { feedback, type FeedbackCategory } from "@/src/db/schema";

export const runtime = "nodejs";

const CATEGORIES: FeedbackCategory[] = [
  "bug",
  "feature",
  "design",
  "copy",
  "other",
];

interface FeedbackRequestBody {
  category: string;
  message?: string;
}

type ParseResult<T> =
  | {
      type: "success";
      body: T;
    }
  | {
      type: "error";
      error: string;
    };

function parse<T>(request: Request): Promise<ParseResult<T>> {
  return request
    .json()
    .then((body) => ({ type: "success" as const, body: body as T }))
    .catch((error) => ({
      type: "error" as const,
      error,
    }));
}

const isCategory = (value: unknown): value is FeedbackCategory =>
  typeof value === "string" && CATEGORIES.includes(value as FeedbackCategory);

/** Any kind of feedback is welcome, so the only required field is the message. */
export const POST = withUser({ error: "Unable to submit feedback." })(async (
  request: Request,
  userId: string,
) => {
  const result = await parse<FeedbackRequestBody>(request);

  if (result.type === "error") {
    return Response.json({ error: result.error }, { status: 400 });
  }
  const body = result.body;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    return Response.json(
      { error: "Feedback message is required." },
      { status: 400 },
    );
  }

  const category = isCategory(body?.category) ? body.category : null;

  const [row] = await getDb()
    .insert(feedback)
    .values({ userId, message, category })
    .returning();

  return Response.json(row, { status: 201 });
});
