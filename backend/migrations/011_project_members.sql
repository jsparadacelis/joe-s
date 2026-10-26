-- Functions a person holds in one project (RGB-4). The studio role says who someone is in the
-- studio; this says what they do in each project, and that decides who promotes or pauses it.

-- A composite key so an assignment can reference its member inside the same study.
ALTER TABLE study_members ADD CONSTRAINT study_members_study_id_id_key UNIQUE (study_id, id);

CREATE TABLE project_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id uuid NOT NULL REFERENCES studies (id),
    project_id uuid NOT NULL,
    member_id uuid NOT NULL,
    role text NOT NULL CHECK (
        role IN (
            'project_director', 'technical_lead', 'architect', 'site_collaborator',
            'licensed_signatory', 'site_management', 'sponsor'
        )
    ),
    assigned_by text NOT NULL CHECK (btrim(assigned_by) <> ''),
    assigned_at timestamptz NOT NULL DEFAULT now(),
    -- Both references stay inside the study: no assignment can cross studies.
    FOREIGN KEY (study_id, project_id) REFERENCES projects (study_id, id),
    FOREIGN KEY (study_id, member_id) REFERENCES study_members (study_id, id),
    UNIQUE (project_id, member_id, role)
);

CREATE INDEX project_members_member_idx ON project_members (member_id);

SELECT protect_study_table('project_members');

-- An assignment is created or removed (both are audited), never rewritten.
REVOKE UPDATE, TRUNCATE ON project_members FROM rgb_app;
