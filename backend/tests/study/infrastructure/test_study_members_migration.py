"""Migration 010 on real Postgres: study_members, its RLS and the resolve_member function."""

import psycopg
import pytest

from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"
SUB = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
OTHER_SUB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"


@pytest.fixture
def db(schema_url):
    url, _ = schema_url
    apply_migrations(url, MIGRATIONS_DIR)
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(
            "INSERT INTO studies (id, name) VALUES (%s, 'Study A (sample)'), "
            "(%s, 'Study B (sample)')",
            (STUDY_A, STUDY_B),
        )
        admin.execute(
            "INSERT INTO study_members (study_id, email, role, status, invited_by) VALUES "
            "(%s, 'ana@example.com', 'partner', 'invited', 'bootstrap'), "
            "(%s, 'bea@example.com', 'architect', 'active', 'bootstrap'), "
            "(%s, 'cris@example.com', 'architect', 'revoked', 'bootstrap'), "
            "(%s, 'dan@example.com', 'director', 'invited', 'bootstrap')",
            (STUDY_A, STUDY_A, STUDY_A, STUDY_B),
        )
        admin.execute(
            "UPDATE study_members SET user_id = %s WHERE email = 'bea@example.com'", (SUB,)
        )
    return url


def as_app(url, study_id=None):
    conn = psycopg.connect(url)
    conn.execute("SET LOCAL ROLE rgb_app")
    if study_id is not None:
        conn.execute("SELECT set_config('app.study_id', %s, true)", (study_id,))
    return conn


def resolve(url, email, sub):
    with as_app(url) as conn:
        return conn.execute("SELECT * FROM resolve_member(%s, %s)", (email, sub)).fetchall()


def stored(url, email):
    with psycopg.connect(url) as admin:
        return admin.execute(
            "SELECT status, user_id FROM study_members WHERE email = %s", (email,)
        ).fetchone()


class TestTable:
    def test_has_the_expected_columns(self, db):
        with psycopg.connect(db) as conn:
            columns = {
                r[0]
                for r in conn.execute(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_schema = current_schema() AND table_name = 'study_members'"
                ).fetchall()
            }

        assert {
            "id",
            "study_id",
            "email",
            "role",
            "qualifications",
            "status",
            "user_id",
            "invited_by",
            "invited_at",
            "activated_at",
            "revoked_at",
        } <= columns

    def test_rls_is_forced_and_the_ci_check_stays_clean(self, db):
        with psycopg.connect(db) as conn:
            unprotected = conn.execute("SELECT * FROM tables_without_rls()").fetchall()

        assert unprotected == []

    def test_email_must_be_stored_in_lowercase(self, db):
        with psycopg.connect(db) as conn, pytest.raises(psycopg.errors.CheckViolation):
            conn.execute(
                "INSERT INTO study_members (study_id, email, role, status, invited_by) "
                "VALUES (%s, 'Eve@Example.com', 'architect', 'invited', 'x')",
                (STUDY_A,),
            )

    def test_email_is_unique_per_study(self, db):
        with psycopg.connect(db) as conn, pytest.raises(psycopg.errors.UniqueViolation):
            conn.execute(
                "INSERT INTO study_members (study_id, email, role, status, invited_by) "
                "VALUES (%s, 'ana@example.com', 'architect', 'invited', 'x')",
                (STUDY_A,),
            )

    @pytest.mark.parametrize(("role", "status"), [("emperor", "invited"), ("architect", "pending")])
    def test_role_and_status_are_constrained(self, db, role, status):
        with psycopg.connect(db) as conn, pytest.raises(psycopg.errors.CheckViolation):
            conn.execute(
                "INSERT INTO study_members (study_id, email, role, status, invited_by) "
                "VALUES (%s, 'eve@example.com', %s, %s, 'x')",
                (STUDY_A, role, status),
            )

    def test_administration_is_a_valid_role(self, db):
        with psycopg.connect(db) as conn:
            conn.execute(
                "INSERT INTO study_members (study_id, email, role, status, invited_by) "
                "VALUES (%s, 'eve@example.com', 'administration', 'invited', 'x')",
                (STUDY_A,),
            )


class TestIsolation:
    def test_a_study_only_sees_its_own_members(self, db):
        with as_app(db, STUDY_A) as conn:
            emails = sorted(r[0] for r in conn.execute("SELECT email FROM study_members"))

        assert emails == ["ana@example.com", "bea@example.com", "cris@example.com"]

    def test_without_a_study_nothing_is_visible(self, db):
        with as_app(db) as conn:
            rows = conn.execute("SELECT email FROM study_members").fetchall()

        assert rows == []

    def test_cannot_insert_into_another_study(self, db):
        with as_app(db, STUDY_A) as conn, pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute(
                "INSERT INTO study_members (study_id, email, role, status, invited_by) "
                "VALUES (%s, 'eve@example.com', 'architect', 'invited', 'x')",
                (STUDY_B,),
            )

    def test_can_invite_into_its_own_study(self, db):
        with as_app(db, STUDY_A) as conn:
            conn.execute(
                "INSERT INTO study_members (study_id, email, role, status, invited_by) "
                "VALUES (%s, 'eve@example.com', 'architect', 'invited', 'x')",
                (STUDY_A,),
            )

    def test_cannot_revoke_a_member_of_another_study(self, db):
        with as_app(db, STUDY_A) as conn:
            touched = conn.execute(
                "UPDATE study_members SET status = 'revoked' WHERE email = 'dan@example.com'"
            ).rowcount

        assert touched == 0
        assert stored(db, "dan@example.com") == ("invited", None)


class TestPrivileges:
    def test_the_api_role_can_revoke_in_its_own_study(self, db):
        with as_app(db, STUDY_A) as conn:
            touched = conn.execute(
                "UPDATE study_members SET status = 'revoked', revoked_at = now() "
                "WHERE email = 'bea@example.com'"
            ).rowcount

        assert touched == 1

    @pytest.mark.parametrize(
        "assignment",
        [
            "email = 'x@example.com'",
            "user_id = 'hijacked'",
            "role = 'partner'",
            "study_id = '22222222-2222-2222-2222-222222222222'",
        ],
    )
    def test_the_api_role_cannot_rewrite_identity_columns(self, db, assignment):
        # Linking the subject belongs to resolve_member; role changes are not part of RGB-2.
        with as_app(db, STUDY_A) as conn, pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute(f"UPDATE study_members SET {assignment} WHERE email = 'ana@example.com'")

    def test_the_api_role_cannot_delete_or_truncate(self, db):
        with as_app(db, STUDY_A) as conn, pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("DELETE FROM study_members")
        with as_app(db, STUDY_A) as conn, pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("TRUNCATE study_members")

    def test_the_function_is_executable_by_the_api_role_but_not_by_public(self, db):
        with psycopg.connect(db) as conn:
            executable = conn.execute(
                "SELECT has_function_privilege('rgb_app', 'resolve_member(text, text)', 'EXECUTE')"
            ).fetchone()[0]
            public_grants = conn.execute(
                "SELECT count(*) FROM pg_proc p, aclexplode(p.proacl) a "
                "WHERE p.proname = 'resolve_member' AND a.grantee = 0 "
                "AND p.pronamespace = current_schema()::regnamespace"
            ).fetchone()[0]
            has_acl = conn.execute(
                "SELECT proacl IS NOT NULL FROM pg_proc "
                "WHERE proname = 'resolve_member' AND pronamespace = current_schema()::regnamespace"
            ).fetchone()[0]

        assert (executable, public_grants, has_acl) == (True, 0, True)

    def test_the_function_is_security_definer_with_a_pinned_search_path(self, db):
        with psycopg.connect(db) as conn:
            definer, config = conn.execute(
                "SELECT prosecdef, proconfig FROM pg_proc "
                "WHERE proname = 'resolve_member' AND pronamespace = current_schema()::regnamespace"
            ).fetchone()

        assert definer is True
        assert any(item.startswith("search_path=") for item in config)

    def test_the_resolver_role_keeps_no_create_privilege_on_the_schema(self, db):
        # It needs CREATE only while the migration changes the function owner (Supabase).
        with psycopg.connect(db) as conn:
            can_create, can_use = conn.execute(
                "SELECT has_schema_privilege('rgb_member_resolver', current_schema(), 'CREATE'), "
                "has_schema_privilege('rgb_member_resolver', current_schema(), 'USAGE')"
            ).fetchone()
            public_create = conn.execute(
                "SELECT has_schema_privilege('rgb_member_resolver', 'public', 'CREATE')"
            ).fetchone()[0]

        assert (can_create, can_use) == (False, True)
        assert public_create is False

    def test_the_function_owner_is_not_the_api_role(self, db):
        with psycopg.connect(db) as conn:
            owner = conn.execute(
                "SELECT pg_get_userbyid(proowner) FROM pg_proc "
                "WHERE proname = 'resolve_member' AND pronamespace = current_schema()::regnamespace"
            ).fetchone()[0]

        assert owner != "rgb_app"


class TestResolveMember:
    def test_activates_a_pending_invitation_and_links_the_subject(self, db):
        rows = resolve(db, "ana@example.com", SUB)

        assert len(rows) == 1
        member_id, study_id, email, role, qualifications, status, user_id, activated = rows[0]
        assert (str(study_id), email, role, qualifications) == (
            STUDY_A,
            "ana@example.com",
            "partner",
            [],
        )
        assert (status, user_id, activated) == ("active", SUB, True)
        assert stored(db, "ana@example.com") == ("active", SUB)

    def test_activated_at_is_set(self, db):
        resolve(db, "ana@example.com", SUB)

        with psycopg.connect(db) as admin:
            activated_at = admin.execute(
                "SELECT activated_at FROM study_members WHERE email = 'ana@example.com'"
            ).fetchone()[0]

        assert activated_at is not None

    def test_the_second_entry_is_not_an_activation(self, db):
        resolve(db, "ana@example.com", SUB)

        rows = resolve(db, "ana@example.com", SUB)

        assert (rows[0][5], rows[0][7]) == ("active", False)

    def test_the_email_match_ignores_case_and_surrounding_spaces(self, db):
        rows = resolve(db, "  ANA@Example.COM ", SUB)

        assert len(rows) == 1
        assert rows[0][2] == "ana@example.com"

    def test_returns_qualifications(self, db):
        with psycopg.connect(db, autocommit=True) as admin:
            admin.execute(
                "UPDATE study_members SET qualifications = '{sponsor,licensed_signatory}' "
                "WHERE email = 'ana@example.com'"
            )

        rows = resolve(db, "ana@example.com", SUB)

        assert sorted(rows[0][4]) == ["licensed_signatory", "sponsor"]

    def test_unknown_email_returns_nothing(self, db):
        assert resolve(db, "nobody@example.com", SUB) == []

    def test_only_the_row_of_that_email_is_returned(self, db):
        rows = resolve(db, "dan@example.com", SUB)

        assert [r[2] for r in rows] == ["dan@example.com"]
        assert str(rows[0][1]) == STUDY_B

    def test_a_wildcard_is_not_a_match(self, db):
        assert resolve(db, "%@example.com", SUB) == []
        assert resolve(db, "", SUB) == []

    def test_an_active_member_with_another_subject_is_not_resolved(self, db):
        assert resolve(db, "bea@example.com", OTHER_SUB) == []
        assert stored(db, "bea@example.com") == ("active", SUB)

    def test_the_linked_subject_gets_in(self, db):
        rows = resolve(db, "bea@example.com", SUB)

        assert (rows[0][5], rows[0][6]) == ("active", SUB)

    def test_a_revoked_member_is_returned_as_revoked_and_left_untouched(self, db):
        rows = resolve(db, "cris@example.com", SUB)

        assert rows[0][5] == "revoked"
        assert rows[0][7] is False
        assert stored(db, "cris@example.com") == ("revoked", None)

    def test_a_pending_invitation_cannot_be_taken_over_once_linked(self, db):
        resolve(db, "ana@example.com", SUB)

        assert resolve(db, "ana@example.com", OTHER_SUB) == []
        assert stored(db, "ana@example.com") == ("active", SUB)

    def test_does_not_expose_the_table_to_the_caller(self, db):
        resolve(db, "ana@example.com", SUB)

        with as_app(db) as conn:
            rows = conn.execute("SELECT email FROM study_members").fetchall()

        assert rows == []
