ALTER TABLE "nominations" ADD COLUMN "completed_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "nominations" SET "completed_at" = now() WHERE "completed" = true;
--> statement-breakpoint
ALTER TABLE "nominations" DROP COLUMN "completed";