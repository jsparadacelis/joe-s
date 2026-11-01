-- Cache of the relief around a plot per study (RGB-33): the domain model as JSON (window,
-- height grid, clipped outline), never the raw answer of the WCS. Derived, re-fetchable public
-- data (no personal data): an expired entry is overwritten in place by an upsert instead of
-- being deleted.

-- One row per (study, 14-character plot reference, window options). `window_key` names the
-- margin and the maximum side that fix the window, as "m<margin>-s<side>" (metres).
CREATE TABLE relief_cache (
    study_id uuid NOT NULL REFERENCES studies (id),
    reference text NOT NULL CHECK (length(reference) = 14),
    window_key text NOT NULL CHECK (window_key ~ '^m(0|10|25|50|100)-s(100|200|300|500)$'),
    payload jsonb NOT NULL,
    fetched_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (study_id, reference, window_key)
);

SELECT protect_study_table('relief_cache');

REVOKE DELETE, TRUNCATE ON relief_cache FROM rgb_app;
