-- Baseline: helper for the multi-study RLS policies (RGB-3).
-- Every transaction sets app.study_id before querying; policies read it here.
CREATE OR REPLACE FUNCTION app_study_id() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT current_setting('app.study_id', true) $$;
