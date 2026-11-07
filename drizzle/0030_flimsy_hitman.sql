ALTER TABLE "movies" ADD COLUMN "box_office" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
WITH legacy AS (
  SELECT id, details,
    details->'boxOffice' AS figures,
    coalesce(details #>> '{boxOffice,budgetSource}', details #>> '{boxOffice,source}', 'boxofficemojo') AS budget_source
  FROM movies
)
UPDATE movies SET box_office =
  CASE WHEN jsonb_typeof(legacy.details->'budget') = 'number' THEN
    CASE WHEN (legacy.details->>'budget')::numeric > 0
      AND (legacy.details->>'budget')::numeric <= 9007199254740991
      AND trunc((legacy.details->>'budget')::numeric) = (legacy.details->>'budget')::numeric
    THEN jsonb_build_object('tmdb', jsonb_build_object('budget', legacy.details->'budget'))
    ELSE '{}'::jsonb END
  ELSE '{}'::jsonb END
  || CASE WHEN legacy.figures->>'source' = 'boxofficemojo'
    THEN jsonb_build_object('boxofficemojo',
      (legacy.figures - 'budgetSource') || jsonb_build_object('budget',
        CASE WHEN legacy.budget_source = 'boxofficemojo'
          THEN legacy.figures->'budget' ELSE 'null'::jsonb END))
    ELSE '{}'::jsonb END
  || CASE WHEN legacy.figures->'budget' IS NOT NULL
    AND legacy.figures->'budget' <> 'null'::jsonb
    AND legacy.budget_source IN ('manual', 'tmdb', 'wikipedia')
    THEN jsonb_build_object(legacy.budget_source,
      jsonb_build_object('budget', legacy.figures->'budget')
      || CASE WHEN legacy.budget_source = 'wikipedia'
        THEN jsonb_build_object('url', legacy.details->'wikipediaUrl')
        ELSE '{}'::jsonb END)
    ELSE '{}'::jsonb END,
  details = legacy.details - 'boxOffice'
FROM legacy WHERE movies.id = legacy.id;