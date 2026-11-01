-- Technical data of a project (RGB-28): value, source, original value and verification of each
-- of the 26 data of the catalog. Only data that have a value are stored; the rest are read as
-- blank from the catalog.
CREATE TABLE technical_data (
    study_id uuid NOT NULL REFERENCES studies (id),
    project_id uuid NOT NULL,
    field_id text NOT NULL CHECK (length(field_id) BETWEEN 1 AND 64),
    value text NOT NULL CHECK (btrim(value) <> '' AND length(value) <= 200),
    source text NOT NULL CHECK (
        source IN (
            'catastro', 'inspire', 'open_meteo', 'calculated', 'cte', 'ncse', 'pvgis', 'manual'
        )
    ),
    -- NULL: typed in by a person, it never came from a query.
    original text CHECK (original IS NULL OR (btrim(original) <> '' AND length(original) <= 200)),
    verified boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, field_id),
    -- The project must belong to the same study: no row can cross studies.
    FOREIGN KEY (study_id, project_id) REFERENCES projects (study_id, id)
);

-- When, and for which cadastral reference, the data of a project were last queried.
CREATE TABLE technical_data_queries (
    study_id uuid NOT NULL REFERENCES studies (id),
    project_id uuid PRIMARY KEY,
    cadastral_reference text NOT NULL CHECK (length(cadastral_reference) = 20),
    queried_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (study_id, project_id) REFERENCES projects (study_id, id)
);

SELECT protect_study_table('technical_data');
SELECT protect_study_table('technical_data_queries');

-- Data are replaced in place (each change is audited), never deleted.
REVOKE DELETE, TRUNCATE ON technical_data FROM rgb_app;
REVOKE DELETE, TRUNCATE ON technical_data_queries FROM rgb_app;
