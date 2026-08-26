ALTER TABLE "seen" RENAME COLUMN "marked_by" TO "user_id";--> statement-breakpoint
ALTER TABLE "seen" DROP CONSTRAINT "seen_room_id_rooms_id_fk";
--> statement-breakpoint
ALTER TABLE "seen" DROP CONSTRAINT "seen_marked_by_user_id_fk";
--> statement-breakpoint
DROP INDEX "seen_room_movie_idx";--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "seen" ADD CONSTRAINT "seen_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seen" DROP COLUMN "room_id";