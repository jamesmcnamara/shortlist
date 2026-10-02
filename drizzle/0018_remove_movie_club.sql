-- Re-runnable: neon-http applies each statement outside a transaction, and the
-- migrator replays the whole file after a failure. `type` is dropped last so a
-- replay never reaches the DELETE without it.
DELETE FROM "rooms" WHERE "type" = 'club';--> statement-breakpoint
DROP TABLE IF EXISTS "votes" CASCADE;--> statement-breakpoint
DROP INDEX IF EXISTS "nominations_room_cycle_idx";--> statement-breakpoint
ALTER TABLE "nominations" DROP COLUMN IF EXISTS "cycle";--> statement-breakpoint
ALTER TABLE "rooms" DROP COLUMN IF EXISTS "nominations_per_cycle";--> statement-breakpoint
ALTER TABLE "rooms" DROP COLUMN IF EXISTS "votes_per_cycle";--> statement-breakpoint
ALTER TABLE "rooms" DROP COLUMN IF EXISTS "cycle_length";--> statement-breakpoint
ALTER TABLE "rooms" DROP COLUMN IF EXISTS "allow_self_vote";--> statement-breakpoint
ALTER TABLE "rooms" DROP COLUMN IF EXISTS "type";
