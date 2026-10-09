ALTER TABLE "rooms" ADD COLUMN "watchlist_for" uuid;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_watchlist_for_user_id_fk" FOREIGN KEY ("watchlist_for") REFERENCES "neon_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_watchlist_for_unique" UNIQUE("watchlist_for");--> statement-breakpoint
INSERT INTO "rooms" ("name", "created_by", "watchlist_for", "invite_code", "admin_invite_code")
SELECT 'Watchlist', "id", "id", gen_random_uuid()::text, gen_random_uuid()::text
FROM "neon_auth"."user"
ON CONFLICT ("watchlist_for") DO NOTHING;--> statement-breakpoint
INSERT INTO "room_members" ("room_id", "user_id", "role")
SELECT "id", "watchlist_for", 'admin'
FROM "rooms"
WHERE "watchlist_for" IS NOT NULL
ON CONFLICT ("room_id", "user_id") DO UPDATE SET "role" = 'admin';