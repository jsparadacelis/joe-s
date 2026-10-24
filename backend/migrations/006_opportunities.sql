-- Opportunity: the data captured when a project is born (phase 0). One per project.
CREATE TABLE opportunities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id uuid NOT NULL,
    project_id uuid NOT NULL,
    client text NOT NULL CHECK (btrim(client) <> ''),
    location text NOT NULL CHECK (btrim(location) <> ''),
    project_type text NOT NULL CHECK (project_type IN (
        'single_family_house', 'rehabilitation', 'multi_family', 'facility', 'industrial',
        'renovation_interiors'
    )),
    estimated_budget numeric(14, 2) CHECK (estimated_budget >= 0),
    deadline date,
    source text,
    decision_date date,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id),
    FOREIGN KEY (study_id, project_id) REFERENCES projects (study_id, id)
);

SELECT protect_study_table('opportunities');
