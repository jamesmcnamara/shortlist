UPDATE "movies"
SET "details" = jsonb_set(
  "details",
  '{trivia,items}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN jsonb_typeof(item) = 'string'
          THEN jsonb_build_object('text', item #>> '{}', 'spoiler', false)
        ELSE item
      END
      ORDER BY position
    )
    FROM jsonb_array_elements("details" #> '{trivia,items}')
      WITH ORDINALITY AS entries(item, position)
  )
)
WHERE jsonb_typeof("details" #> '{trivia,items}') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements("details" #> '{trivia,items}') AS entries(item)
    WHERE jsonb_typeof(item) = 'string'
  );