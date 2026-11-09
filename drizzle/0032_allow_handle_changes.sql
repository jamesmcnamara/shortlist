-- Custom SQL migration file, put your code below! --
CREATE OR REPLACE FUNCTION "shortlist_assign_handle"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  base text;
  candidate text;
  suffix integer := 1;
  -- Matches the space in 'Movie Fan' or '--' and '!' in 'Movie--Fan!'.
  handle_separators CONSTANT text := '[^a-z0-9]+';
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('shortlist-handles'));
  IF NEW."username" IS NULL OR btrim(NEW."username") = '' THEN
    base := left(trim(both '-' from regexp_replace(lower(btrim(NEW."name")), handle_separators, '-', 'g')), 30);
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