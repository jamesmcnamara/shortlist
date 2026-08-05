CREATE TABLE "nominations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "nominations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"movie_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "votes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"nomination_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "tmdb_id" integer;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "poster_url" text;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "runtime" integer;--> statement-breakpoint
ALTER TABLE "nominations" ADD CONSTRAINT "nominations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nominations" ADD CONSTRAINT "nominations_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_nomination_id_nominations_id_fk" FOREIGN KEY ("nomination_id") REFERENCES "public"."nominations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movies" ADD CONSTRAINT "movies_tmdb_id_unique" UNIQUE("tmdb_id");