ALTER TABLE "neon_auth"."user" ADD COLUMN "username" text;
--> statement-breakpoint
ALTER TABLE "neon_auth"."user" ADD COLUMN "displayUsername" text;
--> statement-breakpoint
CREATE FUNCTION "shortlist_assign_handle"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  base text;
  candidate text;
  suffix integer := 1;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('shortlist-handles'));
  IF TG_OP = 'UPDATE' AND OLD."username" IS NOT NULL
     AND NEW."username" IS DISTINCT FROM OLD."username" THEN
    RAISE EXCEPTION 'User handles cannot be changed.';
  END IF;
  IF NEW."username" IS NULL OR btrim(NEW."username") = '' THEN
    base := left(trim(both '-' from regexp_replace(lower(btrim(NEW."name")), '[^a-z0-9]+', '-', 'g')), 30);
    base := trim(trailing '-' from base);
    IF length(base) < 3 THEN base := 'user'; END IF;
    candidate := base;
    WHILE EXISTS (SELECT 1 FROM "neon_auth"."user" WHERE "username" = candidate AND "id" <> NEW."id") LOOP
      suffix := suffix + 1;
      candidate := trim(trailing '-' from left(base, 29 - length(suffix::text))) || '-' || suffix;
    END LOOP;
    NEW."username" := candidate;
  ELSE
    NEW."username" := lower(btrim(NEW."username"));
  END IF;
  NEW."displayUsername" := NEW."username";
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "shortlist_assign_handle"
BEFORE INSERT OR UPDATE OF "username" ON "neon_auth"."user"
FOR EACH ROW EXECUTE FUNCTION "shortlist_assign_handle"();
--> statement-breakpoint
DO $$
DECLARE
  user_id uuid;
BEGIN
  FOR user_id IN SELECT "id" FROM "neon_auth"."user" ORDER BY "createdAt", "id" LOOP
    UPDATE "neon_auth"."user" SET "username" = NULL WHERE "id" = user_id;
  END LOOP;
END;
$$;
--> statement-breakpoint
ALTER TABLE "neon_auth"."user" ADD CONSTRAINT "user_username_unique" UNIQUE ("username");
--> statement-breakpoint
ALTER TABLE "neon_auth"."user" ADD CONSTRAINT "user_username_valid"
CHECK ("username" IS NOT NULL AND "username" ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$');
--> statement-breakpoint
ALTER TABLE "theatres" ADD COLUMN "slug" text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE FUNCTION "shortlist_assign_theatre_slug"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  base text;
  candidate text;
  suffix integer := 1;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."slug" <> '' AND NEW."slug" IS DISTINCT FROM OLD."slug" THEN
    RAISE EXCEPTION 'Theatre slugs cannot be changed.';
  END IF;
  IF NEW."slug" = '' THEN
    PERFORM pg_advisory_xact_lock(hashtext('shortlist-slugs'), hashtext(NEW."created_by"::text));
    base := trim(trailing '-' from left(trim(both '-' from regexp_replace(lower(btrim(NEW."name")), '[^a-z0-9]+', '-', 'g')), 60));
    IF base = '' THEN base := 'theatre'; END IF;
    candidate := base;
    WHILE EXISTS (SELECT 1 FROM "theatres" WHERE "created_by" = NEW."created_by" AND "slug" = candidate AND "id" <> NEW."id") LOOP
      suffix := suffix + 1;
      candidate := trim(trailing '-' from left(base, 59 - length(suffix::text))) || '-' || suffix;
    END LOOP;
    NEW."slug" := candidate;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "shortlist_assign_theatre_slug"
BEFORE INSERT OR UPDATE OF "slug" ON "theatres"
FOR EACH ROW EXECUTE FUNCTION "shortlist_assign_theatre_slug"();
--> statement-breakpoint
DO $$
DECLARE
  theatre_id uuid;
BEGIN
  FOR theatre_id IN SELECT "id" FROM "theatres" ORDER BY "watchlist_for" NULLS LAST, "created_at", "id" LOOP
    UPDATE "theatres" SET "slug" = '' WHERE "id" = theatre_id;
  END LOOP;
END;
$$;
--> statement-breakpoint
CREATE UNIQUE INDEX "theatres_creator_slug_idx" ON "theatres" USING btree ("created_by","slug");
--> statement-breakpoint
ALTER TABLE "theatres" ADD CONSTRAINT "theatres_slug_valid"
CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length("slug") <= 60);