ALTER TABLE "rooms" DROP CONSTRAINT IF EXISTS "rooms_legacy_slug_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "rooms_creator_slug_idx";--> statement-breakpoint
ALTER TABLE "rooms" DROP COLUMN IF EXISTS "slug";--> statement-breakpoint
ALTER TABLE "rooms" DROP COLUMN IF EXISTS "legacy_slug";