ALTER TABLE "rooms" RENAME TO "theatres";--> statement-breakpoint
ALTER TABLE "room_members" RENAME TO "theatre_members";--> statement-breakpoint

ALTER TABLE "theatre_members" RENAME COLUMN "room_id" TO "theatre_id";--> statement-breakpoint
ALTER TABLE "nominations" RENAME COLUMN "room_id" TO "theatre_id";--> statement-breakpoint
ALTER TABLE "nomcoms" RENAME COLUMN "room_id" TO "theatre_id";--> statement-breakpoint
ALTER TABLE "notifications" RENAME COLUMN "room_id" TO "theatre_id";--> statement-breakpoint

ALTER TABLE "theatre_members" RENAME CONSTRAINT "room_members_room_id_user_id_pk" TO "theatre_members_theatre_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "theatre_members" RENAME CONSTRAINT "room_members_room_id_rooms_id_fk" TO "theatre_members_theatre_id_theatres_id_fk";--> statement-breakpoint
ALTER TABLE "theatre_members" RENAME CONSTRAINT "room_members_user_id_user_id_fk" TO "theatre_members_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "theatres" RENAME CONSTRAINT "rooms_watchlist_for_user_id_fk" TO "theatres_watchlist_for_user_id_fk";--> statement-breakpoint
ALTER TABLE "theatres" RENAME CONSTRAINT "rooms_created_by_user_id_fk" TO "theatres_created_by_user_id_fk";--> statement-breakpoint
ALTER TABLE "theatres" RENAME CONSTRAINT "rooms_watchlist_for_unique" TO "theatres_watchlist_for_unique";--> statement-breakpoint
ALTER TABLE "theatres" RENAME CONSTRAINT "rooms_invite_code_unique" TO "theatres_invite_code_unique";--> statement-breakpoint
ALTER TABLE "theatres" RENAME CONSTRAINT "rooms_admin_invite_code_unique" TO "theatres_admin_invite_code_unique";--> statement-breakpoint
ALTER TABLE "nominations" RENAME CONSTRAINT "nominations_room_id_rooms_id_fk" TO "nominations_theatre_id_theatres_id_fk";--> statement-breakpoint
ALTER TABLE "nomcoms" RENAME CONSTRAINT "nomcoms_room_id_rooms_id_fk" TO "nomcoms_theatre_id_theatres_id_fk";--> statement-breakpoint
ALTER TABLE "notifications" RENAME CONSTRAINT "notifications_room_id_user_id_pk" TO "notifications_theatre_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "notifications" RENAME CONSTRAINT "notifications_room_id_user_id_room_members_room_id_user_id_fk" TO "notifications_theatre_members_fk";--> statement-breakpoint

ALTER INDEX "room_members_user_idx" RENAME TO "theatre_members_user_idx";--> statement-breakpoint
ALTER INDEX "nominations_room_movie_idx" RENAME TO "nominations_theatre_movie_idx";
