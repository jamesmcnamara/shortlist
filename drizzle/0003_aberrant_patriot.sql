CREATE TABLE "nomcoms" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "nomcoms_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"nomination_id" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seen" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "seen_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"movie_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nomcoms" ADD CONSTRAINT "nomcoms_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nomcoms" ADD CONSTRAINT "nomcoms_nomination_id_nominations_id_fk" FOREIGN KEY ("nomination_id") REFERENCES "public"."nominations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seen" ADD CONSTRAINT "seen_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seen" ADD CONSTRAINT "seen_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE no action ON UPDATE no action;