CREATE TABLE "tags" (
	"name" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "theatre_tags" (
	"theatre_id" uuid NOT NULL,
	"tag" text NOT NULL,
	CONSTRAINT "theatre_tags_theatre_id_tag_pk" PRIMARY KEY("theatre_id","tag")
);
--> statement-breakpoint
ALTER TABLE "theatre_tags" ADD CONSTRAINT "theatre_tags_theatre_id_theatres_id_fk" FOREIGN KEY ("theatre_id") REFERENCES "public"."theatres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theatre_tags" ADD CONSTRAINT "theatre_tags_tag_tags_name_fk" FOREIGN KEY ("tag") REFERENCES "public"."tags"("name") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "theatre_tags_tag_theatre_idx" ON "theatre_tags" USING btree ("tag","theatre_id");