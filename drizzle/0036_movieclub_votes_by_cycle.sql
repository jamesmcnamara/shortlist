-- Movie club votes move from { cycle, votes: { user: ids } } to { votes: { cycle: { user: ids } } }.
UPDATE "theatres"
SET "extensions" = jsonb_set(
  "extensions",
  '{movieclub}',
  (("extensions" -> 'movieclub') - 'cycle') || jsonb_build_object(
    'votes',
    jsonb_build_object(
      "extensions" -> 'movieclub' ->> 'cycle',
      coalesce("extensions" -> 'movieclub' -> 'votes', '{}'::jsonb)
    )
  )
)
WHERE jsonb_typeof("extensions" -> 'movieclub' -> 'cycle') = 'string';
