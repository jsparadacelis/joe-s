-- Audit log: insert-only. Who, what, when, version and outcome.
CREATE TABLE audit_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    study_id uuid NOT NULL REFERENCES studies (id),
    user_id text NOT NULL CHECK (btrim(user_id) <> ''),
    entity text NOT NULL CHECK (btrim(entity) <> ''),
    entity_id text NOT NULL CHECK (btrim(entity_id) <> ''),
    action text NOT NULL CHECK (btrim(action) <> ''),
    version integer CHECK (version >= 1),
    old_value jsonb,
    new_value jsonb,
    outcome text NOT NULL DEFAULT 'ok' CHECK (outcome IN ('ok', 'rejected')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_entity_idx
    ON audit_events (study_id, entity, entity_id, created_at);

SELECT protect_study_table('audit_events');

-- First barrier: the API can only read and insert.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM rgb_app;

-- Second barrier: not even the owner can alter or empty the log.
CREATE OR REPLACE FUNCTION reject_audit_alteration() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_events is immutable: insert-only';
END
$$;

CREATE TRIGGER audit_events_immutable
    BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_events
    FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_alteration();
