-- Cache of Catastro answers per study (RGB-24): the domain model as JSON, never the raw XML.
-- One row per (study, reference). It is derived, re-fetchable data (not a record to audit), so
-- an expired entry is overwritten in place by an upsert instead of being deleted.
CREATE TABLE cadastral_cache (
    study_id uuid NOT NULL REFERENCES studies (id),
    reference text NOT NULL CHECK (length(reference) = 20),
    payload jsonb NOT NULL,
    fetched_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (study_id, reference)
);

SELECT protect_study_table('cadastral_cache');

REVOKE DELETE, TRUNCATE ON cadastral_cache FROM rgb_app;
