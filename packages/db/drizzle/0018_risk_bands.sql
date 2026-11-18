-- Risk bands stop being three fixed columns.
--
-- biomarker_index carried risk_normal_max / risk_moderate_max /
-- risk_severe_max, which hard-codes both how many bands an index has (three,
-- plus an implied "Extreme" above the last) and what they are called. Real
-- indices do not agree on either — some want Normal/Mild/Severe, some want all
-- five, some want four — and none of that fits in a fixed set of columns.
--
-- A jsonb array instead: ordered, each entry a label with its min and max, and
-- the last entry's max null meaning "anything above this". The order in the
-- array IS the order of the bands, so nothing has to be inferred from the
-- column names.
--
--   [{"label":"Normal","min":0,"max":2},
--    {"label":"Moderate","min":2,"max":3},
--    {"label":"Severe","min":3,"max":null}]
--
-- Nothing computes with these yet — they are configuration the scoring code
-- has not been written against — so the shape can still change cheaply. That
-- is exactly why the old columns are dropped rather than left to rot: two
-- descriptions of the same thing would disagree the moment anyone edited one.

ALTER TABLE "biomarker_index"
  ADD COLUMN IF NOT EXISTS "risk_bands" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint

-- Carry the three columns across, keeping the bands that were actually set.
-- A row with no thresholds configured becomes an empty list rather than a
-- three-band default nobody chose.
UPDATE "biomarker_index" SET "risk_bands" = (
  SELECT coalesce(jsonb_agg(band ORDER BY ord), '[]'::jsonb)
  FROM (
    SELECT 1 AS ord, jsonb_build_object('label', 'Normal',   'min', 0,                      'max', "risk_normal_max")   AS band
      WHERE "risk_normal_max" IS NOT NULL
    UNION ALL
    SELECT 2, jsonb_build_object('label', 'Moderate', 'min', "risk_normal_max",   'max', "risk_moderate_max")
      WHERE "risk_moderate_max" IS NOT NULL
    UNION ALL
    SELECT 3, jsonb_build_object('label', 'Severe',   'min', "risk_moderate_max", 'max', "risk_severe_max")
      WHERE "risk_severe_max" IS NOT NULL
    UNION ALL
    -- The band the old shape left implicit: everything above the last max.
    SELECT 4, jsonb_build_object('label', 'Extreme',  'min', "risk_severe_max",   'max', NULL)
      WHERE "risk_severe_max" IS NOT NULL
  ) AS bands
);--> statement-breakpoint

ALTER TABLE "biomarker_index" DROP COLUMN IF EXISTS "risk_normal_max";--> statement-breakpoint
ALTER TABLE "biomarker_index" DROP COLUMN IF EXISTS "risk_moderate_max";--> statement-breakpoint
ALTER TABLE "biomarker_index" DROP COLUMN IF EXISTS "risk_severe_max";
