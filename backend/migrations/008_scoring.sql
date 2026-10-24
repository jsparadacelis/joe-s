-- Opportunity scoring (RGB-14): seven criteria rated 1 to 5, weighted into a score out of 100.

-- Scoring settings a study can edit. Only overrides are stored: a study with no row uses the
-- defaults of the domain (opportunity.domain.scoring: equal weights, threshold 60). Saving
-- replaces the whole row, so `weights` always holds the 7 criteria.
CREATE TABLE scoring_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id uuid NOT NULL REFERENCES studies (id),
    weights jsonb NOT NULL CHECK (jsonb_typeof(weights) = 'object'),
    threshold smallint NOT NULL CHECK (threshold BETWEEN 1 AND 100),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (study_id)
);

-- Frozen scorings: each save is a new row with the ratings, the weights and the threshold used
-- at that moment, so changing the settings later never alters a saved scoring.
CREATE TABLE opportunity_scorings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id uuid NOT NULL,
    project_id uuid NOT NULL,
    version integer NOT NULL CHECK (version >= 1),
    ratings jsonb NOT NULL CHECK (jsonb_typeof(ratings) = 'object'),
    weights jsonb NOT NULL CHECK (jsonb_typeof(weights) = 'object'),
    threshold smallint NOT NULL CHECK (threshold BETWEEN 1 AND 100),
    score numeric(4, 1) NOT NULL CHECK (score BETWEEN 0 AND 100),
    recommendation text NOT NULL CHECK (recommendation IN ('pursue', 'do_not_pursue')),
    scored_by text NOT NULL CHECK (btrim(scored_by) <> ''),
    scored_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, version),
    FOREIGN KEY (study_id, project_id) REFERENCES projects (study_id, id)
);

SELECT protect_study_table('scoring_settings');
SELECT protect_study_table('opportunity_scorings');

-- Immutable history: the API only reads and inserts, and not even the owner can alter it
-- (same two barriers as promotions and frozen_versions in 004).
REVOKE UPDATE, DELETE, TRUNCATE ON opportunity_scorings FROM rgb_app;

CREATE TRIGGER opportunity_scorings_immutable
    BEFORE UPDATE OR DELETE OR TRUNCATE ON opportunity_scorings
    FOR EACH STATEMENT EXECUTE FUNCTION reject_alteration();
