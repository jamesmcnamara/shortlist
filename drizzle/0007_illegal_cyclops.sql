ALTER TABLE "movies" ADD COLUMN "imdb_rating" real;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "imdb_url" text;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "letterboxd_rating" real;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "letterboxd_url" text;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "rotten_tomatoes_rating" real;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "rotten_tomatoes_url" text;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "rotten_tomatoes_audience_rating" real;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "rotten_tomatoes_audience_url" text;