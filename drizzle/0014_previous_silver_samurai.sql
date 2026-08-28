DROP INDEX "nominations_room_movie_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "nominations_room_movie_idx" ON "nominations" USING btree ("room_id","movie_id");--> statement-breakpoint
ALTER TABLE "rooms" DROP COLUMN "allow_duplicate_nominations";