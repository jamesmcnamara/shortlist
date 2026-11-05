import type { ExtensionName } from "@/app/lib/extensions";
import { theatres } from "@/src/db/schema";
import { sql, type SQL } from "drizzle-orm";

/** An extension's object in `theatres.extensions`, or `{}` if it has none. */
export const extensionData = (name: ExtensionName) => sql`(
  case when jsonb_typeof(${theatres.extensions} -> ${name}::text) = 'object'
  then ${theatres.extensions} -> ${name}::text
  else '{}'::jsonb end
)`;

/**
 * A new `theatres.extensions` value with `patch`, a jsonb object, merged into
 * one extension's data. Other extensions' data is left alone.
 */
export const mergeExtensionData = (name: ExtensionName, patch: SQL) =>
  sql`${theatres.extensions} || jsonb_build_object(${name}::text, ${extensionData(name)} || ${patch})`;
