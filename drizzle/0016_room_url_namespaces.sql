CREATE TABLE "user_handles" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "handle" text NOT NULL,
  CONSTRAINT "user_handles_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
ALTER TABLE "user_handles" ADD CONSTRAINT "user_handles_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "neon_auth"."user"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
WITH normalized AS (
  SELECT
    id,
    COALESCE(
      NULLIF(
        regexp_replace(
          regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g'),
          '(^-+|-+$)',
          '',
          'g'
        ),
        ''
      ),
      'user'
    ) AS base
  FROM "neon_auth"."user"
),
ranked AS (
  SELECT
    id,
    base,
    row_number() OVER (PARTITION BY base ORDER BY id) AS position
  FROM normalized
)
INSERT INTO "user_handles" ("user_id", "handle")
SELECT
  id,
  CASE
    WHEN position = 1 THEN left(base, 60)
    ELSE left(base, 53) || '-' || substr(replace(id::text, '-', ''), 1, 6)
  END
FROM ranked;
--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "legacy_slug" text;
--> statement-breakpoint
UPDATE "rooms" SET "legacy_slug" = "slug";
--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_legacy_slug_unique" UNIQUE("legacy_slug");
--> statement-breakpoint
ALTER TABLE "rooms" DROP CONSTRAINT "rooms_slug_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_creator_slug_idx" ON "rooms" USING btree ("created_by","slug");
