ALTER TABLE "rooms" ADD COLUMN "type" text DEFAULT 'club' NOT NULL;--> statement-breakpoint
UPDATE "rooms" SET "type" = 'watchlist' WHERE "nominations_per_cycle" IS NULL;