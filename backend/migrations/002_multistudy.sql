-- Multi-study: every study is an isolated tenant, enforced with row level security (RLS).

-- Role the API runs every request as. No login: reached with SET LOCAL ROLE.
-- Table owners bypass RLS, so the API never queries as the owner.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rgb_app') THEN
        CREATE ROLE rgb_app NOLOGIN;
    END IF;
    EXECUTE format('GRANT rgb_app TO %I', current_user);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO rgb_app', current_schema());
END
$$;

-- Template: every business table (with a study_id column) calls it in its migration.
CREATE OR REPLACE FUNCTION protect_study_table(tbl regclass) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
        'CREATE POLICY study_isolation ON %s '
        'USING (study_id::text = app_study_id()) '
        'WITH CHECK (study_id::text = app_study_id())',
        tbl
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO rgb_app', tbl);
END
$$;

-- CI check: tables in the schema without forced RLS or without a policy.
CREATE OR REPLACE FUNCTION tables_without_rls() RETURNS SETOF text
LANGUAGE sql STABLE AS $$
    SELECT c.relname::text
    FROM pg_class c
    WHERE c.relnamespace = current_schema()::regnamespace
      AND c.relkind = 'r'
      AND c.relname <> 'schema_migrations'
      AND (
          NOT c.relrowsecurity
          OR NOT c.relforcerowsecurity
          OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
      )
    ORDER BY 1
$$;

CREATE TABLE studies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (btrim(name) <> ''),
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE studies FORCE ROW LEVEL SECURITY;
CREATE POLICY study_isolation ON studies
    USING (id::text = app_study_id())
    WITH CHECK (id::text = app_study_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON studies TO rgb_app;
