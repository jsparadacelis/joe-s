-- Lifecycle: the phase is the project state (0 Opportunity to 7 Closing).

-- Global phase configuration (not study data): read-only for the API.
-- Names and exit deliverables are user-facing Spanish text (PRD).
CREATE TABLE phase_config (
    id smallint PRIMARY KEY CHECK (id BETWEEN 0 AND 7),
    name text NOT NULL,
    exit_deliverable text NOT NULL,
    authority text NOT NULL
);

INSERT INTO phase_config (id, name, exit_deliverable, authority) VALUES
    (0, 'Oportunidad', 'Scoring (7 criterios de 1 a 5, nota sobre 100, umbral) + tipología y escala → plan de semanas', 'partner_director'),
    (1, 'Inicio', 'Ficha del proyecto completa (incluye referencia catastral, contrato, gobierno, repositorio)', 'partner_director'),
    (2, 'Briefing y concepto', 'Datos técnicos del inmueble verificados + brief manual (con topográfico y alineación) + aprobación del cliente registrada', 'project_director'),
    (3, 'Anteproyecto', 'Paquete de anteproyecto aprobado y congelado; visor de relieve 3D como apoyo', 'project_director'),
    (4, 'Proyecto básico', 'Básico emitido y licencia concedida con condiciones', 'licensed_signatory'),
    (5, 'Proyecto de ejecución', 'Ejecución coordinada, visada y emitida', 'licensed_signatory'),
    (6, 'Obra', 'Registro de obra completo y recepción', 'site_management'),
    (7, 'Cierre', 'Certificado final, Libro del Edificio y lecciones', 'sponsor');

ALTER TABLE phase_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_config FORCE ROW LEVEL SECURITY;
CREATE POLICY global_read ON phase_config FOR SELECT USING (true);
GRANT SELECT ON phase_config TO rgb_app;

-- Project: a single phase (current_phase is required and must exist).
CREATE TABLE projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id uuid NOT NULL REFERENCES studies (id),
    code text NOT NULL CHECK (btrim(code) <> ''),
    name text NOT NULL CHECK (btrim(name) <> ''),
    current_phase smallint NOT NULL REFERENCES phase_config (id),
    traffic_light text CHECK (traffic_light IN ('green', 'amber', 'red')),
    next_milestone text,
    responsible_id text,
    paused boolean NOT NULL DEFAULT false,
    active boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (study_id, code),
    UNIQUE (study_id, id),
    -- "Active" requires a responsible person, a phase (already required), a next milestone
    -- and a traffic light.
    CONSTRAINT active_requires_data CHECK (
        NOT active OR (
            btrim(coalesce(responsible_id, '')) <> ''
            AND btrim(coalesce(next_milestone, '')) <> ''
            AND traffic_light IS NOT NULL
        )
    )
);

-- Exit deliverable of each project phase.
CREATE TABLE exit_deliverables (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id uuid NOT NULL,
    project_id uuid NOT NULL,
    phase smallint NOT NULL REFERENCES phase_config (id),
    content jsonb NOT NULL DEFAULT '{}',
    complete boolean NOT NULL DEFAULT false,
    approved boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, phase),
    CHECK (NOT approved OR complete),
    FOREIGN KEY (study_id, project_id) REFERENCES projects (study_id, id)
);

-- Version frozen on promotion: immutable.
CREATE TABLE frozen_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id uuid NOT NULL,
    project_id uuid NOT NULL,
    phase smallint NOT NULL REFERENCES phase_config (id),
    version integer NOT NULL CHECK (version >= 1),
    content jsonb NOT NULL,
    frozen_by text NOT NULL CHECK (btrim(frozen_by) <> ''),
    frozen_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, phase, version),
    FOREIGN KEY (study_id, project_id) REFERENCES projects (study_id, id)
);

-- History of promotions, holds and "do not pursue" decisions: insert-only.
CREATE TABLE promotions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id uuid NOT NULL,
    project_id uuid NOT NULL,
    action text NOT NULL,
    from_phase smallint NOT NULL REFERENCES phase_config (id),
    to_phase smallint REFERENCES phase_config (id),
    user_id text NOT NULL CHECK (btrim(user_id) <> ''),
    outcome text NOT NULL DEFAULT 'ok' CHECK (outcome IN ('ok', 'rejected')),
    reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (study_id, project_id) REFERENCES projects (study_id, id),
    CONSTRAINT consistent_action CHECK (
        (action = 'promote' AND to_phase IS NOT NULL AND to_phase = from_phase + 1)
        OR (action = 'hold' AND to_phase IS NULL AND btrim(coalesce(reason, '')) <> '')
        OR (
            action = 'do_not_pursue' AND from_phase = 0 AND to_phase IS NULL
            AND btrim(coalesce(reason, '')) <> ''
        )
    )
);

-- Internal milestones of a phase (e.g. contract, kick-off, license, sign-off, handover):
-- they are not states.
CREATE TABLE internal_milestones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id uuid NOT NULL,
    project_id uuid NOT NULL,
    phase smallint NOT NULL REFERENCES phase_config (id),
    name text NOT NULL CHECK (btrim(name) <> ''),
    due_date date,
    completed_at timestamptz,
    FOREIGN KEY (study_id, project_id) REFERENCES projects (study_id, id)
);

SELECT protect_study_table('projects');
SELECT protect_study_table('exit_deliverables');
SELECT protect_study_table('frozen_versions');
SELECT protect_study_table('promotions');
SELECT protect_study_table('internal_milestones');

-- Immutable histories: the API only reads and inserts, and not even the owner can alter them.
REVOKE UPDATE, DELETE, TRUNCATE ON frozen_versions, promotions FROM rgb_app;

CREATE OR REPLACE FUNCTION reject_alteration() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% is immutable: insert-only', TG_TABLE_NAME;
END
$$;

CREATE TRIGGER frozen_versions_immutable
    BEFORE UPDATE OR DELETE OR TRUNCATE ON frozen_versions
    FOR EACH STATEMENT EXECUTE FUNCTION reject_alteration();

CREATE TRIGGER promotions_immutable
    BEFORE UPDATE OR DELETE OR TRUNCATE ON promotions
    FOR EACH STATEMENT EXECUTE FUNCTION reject_alteration();
