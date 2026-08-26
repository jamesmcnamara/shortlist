-- Dropping room_id in 0009 can leave one row per room for the same viewing,
-- so collapse those before the uniqueness rule can be enforced.
DELETE FROM "seen" a USING "seen" b
  WHERE a."user_id" = b."user_id"
    AND a."movie_id" = b."movie_id"
    AND a."id" > b."id";--> statement-breakpoint
CREATE UNIQUE INDEX "seen_user_movie_idx" ON "seen" USING btree ("user_id","movie_id");
