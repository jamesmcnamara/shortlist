ALTER TABLE "theatres" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
UPDATE theatres
SET updated_at = greatest(created_at, (
  SELECT max(nominations.created_at) FROM nominations
  WHERE nominations.theatre_id = theatres.id
));
--> statement-breakpoint
CREATE FUNCTION touch_theatre_metadata() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name
    OR NEW.description IS DISTINCT FROM OLD.description THEN
    NEW.updated_at := greatest(OLD.updated_at, clock_timestamp());
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER theatre_metadata_updated
BEFORE UPDATE OF name, description ON theatres
FOR EACH ROW EXECUTE FUNCTION touch_theatre_metadata();
--> statement-breakpoint
CREATE FUNCTION touch_theatre_nominations() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE theatres
  SET updated_at = greatest(updated_at, clock_timestamp())
  WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.theatre_id ELSE NEW.theatre_id END;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER theatre_nominations_updated
AFTER INSERT OR DELETE ON nominations
FOR EACH ROW EXECUTE FUNCTION touch_theatre_nominations();