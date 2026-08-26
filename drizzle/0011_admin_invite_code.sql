ALTER TABLE "rooms" ADD COLUMN "admin_invite_code" text;--> statement-breakpoint
-- Backfill existing rooms with a random code before the column is required;
-- app code always supplies one for new rooms going forward.
UPDATE "rooms" SET "admin_invite_code" = replace(gen_random_uuid()::text, '-', '') WHERE "admin_invite_code" IS NULL;--> statement-breakpoint
ALTER TABLE "rooms" ALTER COLUMN "admin_invite_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_admin_invite_code_unique" UNIQUE("admin_invite_code");
