-- Study members and invitations (RGB-2): who may enter each study, with which role.

CREATE TABLE study_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id uuid NOT NULL REFERENCES studies (id),
    email text NOT NULL CHECK (email = lower(btrim(email)) AND email LIKE '_%@_%'),
    role text NOT NULL CHECK (
        role IN (
            'partner', 'director', 'project_director', 'technical_lead',
            'architect', 'site_collaborator', 'administration'
        )
    ),
    qualifications text[] NOT NULL DEFAULT '{}' CHECK (
        qualifications <@ ARRAY['licensed_signatory', 'site_management', 'sponsor']
    ),
    status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'revoked')),
    -- The Supabase Auth `sub`, linked the first time the verified email signs in.
    user_id text CHECK (user_id IS NULL OR btrim(user_id) <> ''),
    invited_by text NOT NULL CHECK (btrim(invited_by) <> ''),
    invited_at timestamptz NOT NULL DEFAULT now(),
    activated_at timestamptz,
    revoked_at timestamptz
);

CREATE UNIQUE INDEX study_members_email_idx ON study_members (study_id, lower(email));

SELECT protect_study_table('study_members');

-- Members are revoked, never deleted or rewritten: the API role can only flip the status.
REVOKE UPDATE, DELETE, TRUNCATE ON study_members FROM rgb_app;
GRANT UPDATE (status, revoked_at) ON study_members TO rgb_app;

-- Sign-in happens before the study is known, so it needs a way around the study policy that is
-- as narrow as possible: a dedicated role that owns `resolve_member` and nothing else.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rgb_member_resolver') THEN
        CREATE ROLE rgb_member_resolver NOLOGIN;
    END IF;
    EXECUTE format('GRANT rgb_member_resolver TO %I', current_user);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO rgb_member_resolver', current_schema());
END
$$;

GRANT SELECT, UPDATE ON study_members TO rgb_member_resolver;
CREATE POLICY resolver_access ON study_members TO rgb_member_resolver
    USING (true) WITH CHECK (true);

-- Returns only the row of that email. Activates a pending invitation and links it to the
-- subject; an already linked account does not resolve for another subject. Revoked rows are
-- returned untouched so the API can say why the person cannot enter.
DO $$
BEGIN
    EXECUTE format($fn$
        CREATE FUNCTION resolve_member(p_email text, p_subject text)
        RETURNS TABLE (
            member_id uuid, study_id uuid, email text, role text, qualifications text[],
            status text, user_id text, activated boolean
        )
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = %I, pg_temp
        AS $body$
        #variable_conflict use_column
        DECLARE
            m study_members%%ROWTYPE;
            was_activated boolean := false;
        BEGIN
            SELECT * INTO m FROM study_members sm
            WHERE lower(sm.email) = lower(btrim(p_email))
            ORDER BY (sm.status = 'revoked'), sm.invited_at
            LIMIT 1
            FOR UPDATE;
            IF NOT FOUND THEN
                RETURN;
            END IF;
            IF m.status = 'invited' THEN
                UPDATE study_members sm
                SET status = 'active', user_id = p_subject, activated_at = now()
                WHERE sm.id = m.id
                RETURNING * INTO m;
                was_activated := true;
            ELSIF m.status = 'active' AND m.user_id IS DISTINCT FROM p_subject THEN
                RETURN;
            END IF;
            RETURN QUERY SELECT m.id, m.study_id, m.email, m.role, m.qualifications,
                m.status, m.user_id, was_activated;
        END
        $body$
    $fn$, current_schema());
END
$$;

-- Changing a function's owner requires the NEW owner to have CREATE on the schema. A
-- superuser skips that check, but Supabase's `postgres` role is not one. Grant it only for the
-- ALTER and take it back right after, so the resolver role ends up unable to create objects.
DO $$
BEGIN
    EXECUTE format('GRANT CREATE ON SCHEMA %I TO rgb_member_resolver', current_schema());
END
$$;

ALTER FUNCTION resolve_member(text, text) OWNER TO rgb_member_resolver;

DO $$
BEGIN
    EXECUTE format('REVOKE CREATE ON SCHEMA %I FROM rgb_member_resolver', current_schema());
END
$$;
REVOKE ALL ON FUNCTION resolve_member(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_member(text, text) TO rgb_app;
