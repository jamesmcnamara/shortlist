CREATE TABLE "notifications" (
	"room_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "notifications_room_id_user_id_pk" PRIMARY KEY("room_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"endpoint" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_room_id_user_id_room_members_room_id_user_id_fk" FOREIGN KEY ("room_id","user_id") REFERENCES "public"."room_members"("room_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");