import { z } from "zod";

// Postgres `integer` identity columns.
const MAX_DB_ID = 2_147_483_647;

export const dbId = (error: string) =>
  z.int(error).positive(error).max(MAX_DB_ID, error);

export const dbIdParam = (error: string) =>
  z.coerce.number(error).pipe(dbId(error));

export const requiredText = (error: string) =>
  z.string(error).trim().min(1, error);

/** A missing or malformed body reads as `{}`, so each field reports what it needs. */
export async function parseJson<T extends z.ZodType>(
  request: Request,
  schema: T,
) {
  const body: unknown = await request.json().catch(() => null);
  return schema.safeParse(body ?? {});
}

export const badRequest = (error: z.ZodError) =>
  Response.json(
    { error: error.issues[0]?.message ?? "Invalid request." },
    { status: 400 },
  );
