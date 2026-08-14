CREATE TABLE "room_members" (
	"room_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_members_room_id_user_id_pk" PRIMARY KEY("room_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid NOT NULL,
	"invite_code" text NOT NULL,
	"nominations_per_cycle" integer,
	"votes_per_cycle" integer DEFAULT 5 NOT NULL,
	"cycle_length" text DEFAULT 'month' NOT NULL,
	"allow_self_vote" boolean DEFAULT false NOT NULL,
	"allow_duplicate_nominations" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_slug_unique" UNIQUE("slug"),
	CONSTRAINT "rooms_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
ALTER TABLE "nominations" RENAME COLUMN "month" TO "cycle";--> statement-breakpoint
ALTER TABLE "votes" RENAME COLUMN "month" TO "cycle";--> statement-breakpoint
ALTER TABLE "nomcoms" DROP CONSTRAINT "nomcoms_nomination_id_nominations_id_fk";
--> statement-breakpoint
ALTER TABLE "seen" DROP CONSTRAINT "seen_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "votes" DROP CONSTRAINT "votes_nomination_id_nominations_id_fk";
--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "details" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "ratings" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "nomcoms" ADD COLUMN "room_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "nominations" ADD COLUMN "room_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "seen" ADD COLUMN "room_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "seen" ADD COLUMN "marked_by" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "votes" ADD COLUMN "room_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "neon_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_members_user_idx" ON "room_members" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "nomcoms" ADD CONSTRAINT "nomcoms_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nomcoms" ADD CONSTRAINT "nomcoms_nomination_id_nominations_id_fk" FOREIGN KEY ("nomination_id") REFERENCES "public"."nominations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nominations" ADD CONSTRAINT "nominations_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seen" ADD CONSTRAINT "seen_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seen" ADD CONSTRAINT "seen_marked_by_user_id_fk" FOREIGN KEY ("marked_by") REFERENCES "neon_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_nomination_id_nominations_id_fk" FOREIGN KEY ("nomination_id") REFERENCES "public"."nominations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nomcoms_nomination_idx" ON "nomcoms" USING btree ("nomination_id");--> statement-breakpoint
CREATE INDEX "nominations_room_cycle_idx" ON "nominations" USING btree ("room_id","cycle");--> statement-breakpoint
CREATE INDEX "nominations_room_movie_idx" ON "nominations" USING btree ("room_id","movie_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seen_room_movie_idx" ON "seen" USING btree ("room_id","movie_id");--> statement-breakpoint
CREATE INDEX "votes_room_user_cycle_idx" ON "votes" USING btree ("room_id","user_id","cycle");--> statement-breakpoint
CREATE INDEX "votes_nomination_idx" ON "votes" USING btree ("nomination_id");--> statement-breakpoint
ALTER TABLE "movies" DROP COLUMN "title";--> statement-breakpoint
ALTER TABLE "movies" DROP COLUMN "poster_url";--> statement-breakpoint
ALTER TABLE "movies" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "movies" DROP COLUMN "year";--> statement-breakpoint
ALTER TABLE "movies" DROP COLUMN "runtime";--> statement-breakpoint
ALTER TABLE "movies" DROP COLUMN "tmdb_rating";--> statement-breakpoint
ALTER TABLE "movies" DROP COLUMN "imdb_rating";--> statement-breakpoint
ALTER TABLE "movies" DROP COLUMN "imdb_url";--> statement-breakpoint
ALTER TABLE "movies" DROP COLUMN "letterboxd_rating";--> statement-breakpoint
ALTER TABLE "movies" DROP COLUMN "letterboxd_url";--> statement-breakpoint
ALTER TABLE "movies" DROP COLUMN "rotten_tomatoes_rating";--> statement-breakpoint
ALTER TABLE "movies" DROP COLUMN "rotten_tomatoes_url";--> statement-breakpoint
ALTER TABLE "movies" DROP COLUMN "rotten_tomatoes_audience_rating";--> statement-breakpoint
ALTER TABLE "movies" DROP COLUMN "rotten_tomatoes_audience_url";--> statement-breakpoint
ALTER TABLE "seen" DROP COLUMN "user_id";