ALTER TABLE "notifications" ADD COLUMN "new_movies" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "extensions" jsonb DEFAULT '{}'::jsonb NOT NULL;