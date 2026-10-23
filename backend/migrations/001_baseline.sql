-- Baseline: función de apoyo para las políticas RLS multiestudio (RGB-3).
-- Cada transacción fija app.estudio_id antes de consultar; las políticas la leen aquí.
CREATE OR REPLACE FUNCTION app_estudio_id() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT current_setting('app.estudio_id', true) $$;
