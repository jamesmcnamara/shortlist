import type { ExtensionName } from "@/app/lib/extensions";
import { theatres } from "@/src/db/schema";
import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

/**
 * An extension's object in an `extensions` column (`theatres.extensions`
 * unless given another), or `{}` if it has none.
 */
export const extensionData = (
  name: ExtensionName,
  column: SQLWrapper = theatres.extensions,
) => sql`(
  case when jsonb_typeof(${column} -> ${name}::text) = 'object'
  then ${column} -> ${name}::text
  else '{}'::jsonb end
)`;

/**
 * A new `extensions` column value with `patch`, a jsonb object, merged into
 * one extension's data. Other extensions' data is left alone.
 */
export const mergeExtensionData = (
  name: ExtensionName,
  patch: SQL,
  column: SQLWrapper = theatres.extensions,
) =>
  sql`${column} || jsonb_build_object(${name}::text, ${extensionData(name, column)} || ${patch})`;
