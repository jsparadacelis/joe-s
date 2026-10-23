-- Plan settings a study can edit. Only overrides are stored: the PRD defaults live in the domain
-- (opportunity.domain.plan), so a new study works without seeding anything.

-- Active weeks for phases 1 to 7 of each project type.
CREATE TABLE plan_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id uuid NOT NULL REFERENCES studies (id),
    project_type text NOT NULL CHECK (project_type IN (
        'single_family_house', 'rehabilitation', 'multi_family', 'facility', 'industrial',
        'renovation_interiors'
    )),
    weeks integer[] NOT NULL CHECK (
        array_ndims(weeks) = 1 AND cardinality(weeks) = 7 AND 1 <= ALL (weeks)
    ),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (study_id, project_type)
);

-- Multiplier applied to a template according to the project scale.
CREATE TABLE scale_factors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id uuid NOT NULL REFERENCES studies (id),
    scale text NOT NULL CHECK (scale IN ('small', 'medium', 'large')),
    factor numeric(4, 2) NOT NULL CHECK (factor > 0 AND factor <= 10),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (study_id, scale)
);

SELECT protect_study_table('plan_templates');
SELECT protect_study_table('scale_factors');
