CREATE TABLE "movies" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "title" text NOT NULL,
  "year" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
