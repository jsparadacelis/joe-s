-- Confirmed project plan (RGB-16): the baseline set when an opportunity is promoted to phase 1.

-- One row per project, written once at promotion with the weeks the person confirmed. Later
-- changes to the templates or scale factors never touch it.
CREATE TABLE project_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id uuid NOT NULL,
    project_id uuid NOT NULL,
    project_type text NOT NULL CHECK (
        project_type IN (
            'single_family_house', 'rehabilitation', 'multi_family',
            'facility', 'industrial', 'renovation_interiors'
        )
    ),
    scale text NOT NULL CHECK (scale IN ('small', 'medium', 'large')),
    weeks smallint[] NOT NULL CHECK (
        cardinality(weeks) = 7
        AND array_ndims(weeks) = 1
        AND array_position(weeks, NULL) IS NULL
        AND weeks[1] BETWEEN 1 AND 520 AND weeks[2] BETWEEN 1 AND 520
        AND weeks[3] BETWEEN 1 AND 520 AND weeks[4] BETWEEN 1 AND 520
        AND weeks[5] BETWEEN 1 AND 520 AND weeks[6] BETWEEN 1 AND 520
        AND weeks[7] BETWEEN 1 AND 520
    ),
    confirmed_by text NOT NULL CHECK (btrim(confirmed_by) <> ''),
    confirmed_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id),
    FOREIGN KEY (study_id, project_id) REFERENCES projects (study_id, id)
);

SELECT protect_study_table('project_plans');

-- Immutable baseline: the API only reads and inserts, and not even the owner can alter it
-- (same two barriers as promotions and frozen_versions in 004).
REVOKE UPDATE, DELETE, TRUNCATE ON project_plans FROM rgb_app;

CREATE TRIGGER project_plans_immutable
    BEFORE UPDATE OR DELETE OR TRUNCATE ON project_plans
    FOR EACH STATEMENT EXECUTE FUNCTION reject_alteration();
