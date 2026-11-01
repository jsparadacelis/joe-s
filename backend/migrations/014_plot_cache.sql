-- Cache of INSPIRE plot outlines per study (RGB-25): the domain model as JSON (inputs and
-- derived measurements), never the raw GML. One row per (study, 14-character plot reference).
-- Derived, re-fetchable public cartography (no ownership data): an expired entry is overwritten
-- in place by an upsert instead of being deleted.
CREATE TABLE plot_cache (
    study_id uuid NOT NULL REFERENCES studies (id),
    reference text NOT NULL CHECK (length(reference) = 14),
    payload jsonb NOT NULL,
    fetched_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (study_id, reference)
);

SELECT protect_study_table('plot_cache');

REVOKE DELETE, TRUNCATE ON plot_cache FROM rgb_app;
