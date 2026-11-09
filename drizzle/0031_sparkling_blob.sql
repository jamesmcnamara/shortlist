CREATE TABLE "redirects" (
	"from_handle" text PRIMARY KEY NOT NULL,
	"to_handle" text NOT NULL,
	CONSTRAINT "redirects_handles_valid" CHECK ("redirects"."from_handle" ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$' AND "redirects"."to_handle" ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'),
	CONSTRAINT "redirects_handles_different" CHECK ("redirects"."from_handle" <> "redirects"."to_handle")
);
