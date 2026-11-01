-- Caches of the terrain profile and the photovoltaic yield per study (RGB-26): the domain model
-- as JSON, never the raw answer of the service. Derived, re-fetchable public data (no personal
-- data): an expired entry is overwritten in place by an upsert instead of being deleted.

-- One row per (study, 14-character plot reference): altitude and estimated slope.
CREATE TABLE terrain_cache (
    study_id uuid NOT NULL REFERENCES studies (id),
    reference text NOT NULL CHECK (length(reference) = 14),
    payload jsonb NOT NULL,
    fetched_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (study_id, reference)
);

SELECT protect_study_table('terrain_cache');

REVOKE DELETE, TRUNCATE ON terrain_cache FROM rgb_app;

-- One row per (study, location rounded to 3 decimals, as "lat,lon"): nearby plots share it.
CREATE TABLE pv_cache (
    study_id uuid NOT NULL REFERENCES studies (id),
    location text NOT NULL CHECK (location ~ '^-?[0-9]{1,2}\.[0-9]{3},-?[0-9]{1,3}\.[0-9]{3}$'),
    payload jsonb NOT NULL,
    fetched_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (study_id, location)
);

SELECT protect_study_table('pv_cache');

REVOKE DELETE, TRUNCATE ON pv_cache FROM rgb_app;
