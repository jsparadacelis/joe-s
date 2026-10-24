-- Pauses: stretches in which a project's active clock stops (the calendar keeps running).
-- Dates are UTC calendar days. `projects.paused` is kept in step by the application.
CREATE TABLE pauses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id uuid NOT NULL,
    project_id uuid NOT NULL,
    -- Phase the project was in when the pause was opened (1 to 7: phase 0 has no clock).
    phase smallint NOT NULL CHECK (phase BETWEEN 1 AND 7),
    reason text NOT NULL CHECK (reason IN (
        'client_wait', 'authority_wait', 'internal_decision', 'other'
    )),
    started_on date NOT NULL,
    expected_resumption date NOT NULL,
    -- NULL while the pause is open.
    resumed_on date,
    opened_by text NOT NULL CHECK (btrim(opened_by) <> ''),
    closed_by text CHECK (closed_by IS NULL OR btrim(closed_by) <> ''),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (expected_resumption >= started_on),
    CHECK (resumed_on IS NULL OR resumed_on >= started_on),
    CHECK ((resumed_on IS NULL) = (closed_by IS NULL)),
    FOREIGN KEY (study_id, project_id) REFERENCES projects (study_id, id)
);

-- At most one open pause per project, even under concurrency.
CREATE UNIQUE INDEX pauses_one_open_per_project ON pauses (project_id) WHERE resumed_on IS NULL;

CREATE INDEX pauses_project_idx ON pauses (project_id, started_on DESC, created_at DESC);

SELECT protect_study_table('pauses');
