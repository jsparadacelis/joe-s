"""The demo seed must never reach production: every refusal is covered, with and without --force."""

import pytest

from backend.app.shared.seed_demo import (
    DemoSeedForbidden,
    NonLocalDatabase,
    assert_demo_target,
)

LOCAL = "postgresql://rgb:rgb@localhost:54329/rgb"
SUPABASE_POOLER = (
    "postgresql://postgres.abcdefgh:s3cr3tpass@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"
)
SUPABASE_DIRECT = "postgresql://postgres:s3cr3tpass@db.abcdefgh.supabase.co:5432/postgres"


class TestAcceptedTargets:
    @pytest.mark.parametrize("environment", ["development", "dev", "local", "test", "Development"])
    def test_accepts_the_local_database_in_a_development_environment(self, environment):
        assert_demo_target(LOCAL, environment)

    def test_accepts_a_non_local_host_only_with_force(self):
        url = "postgresql://rgb:rgb@db.internal.example.com:5432/rgb"

        with pytest.raises(NonLocalDatabase):
            assert_demo_target(url, "development")

        assert_demo_target(url, "development", force=True)


class TestAlwaysRefused:
    @pytest.mark.parametrize("environment", ["production", "PRODUCTION", " prod ", "staging"])
    @pytest.mark.parametrize("force", [False, True])
    def test_refuses_a_production_like_environment_even_on_a_local_host(self, environment, force):
        with pytest.raises(DemoSeedForbidden):
            assert_demo_target(LOCAL, environment, force=force)

    @pytest.mark.parametrize(
        "url",
        [
            SUPABASE_POOLER,
            SUPABASE_DIRECT,
            "postgresql://u:s3cr3tpass@DB.ABCDEFGH.SUPABASE.CO/postgres",
            "postgresql://u:s3cr3tpass@some-pooler.example.net:6543/postgres",
            "postgresql://u:s3cr3tpass@localhost,db.abcdefgh.supabase.co/postgres",
            "postgresql://u:s3cr3tpass@/postgres?host=aws-0-eu-west-1.pooler.supabase.com",
            "postgresql://u:s3cr3tpass@/postgres?hostaddr=10.0.0.1&host=x.supabase.com",
        ],
    )
    @pytest.mark.parametrize("force", [False, True])
    def test_refuses_a_supabase_or_pooler_host_even_with_force(self, url, force):
        with pytest.raises(DemoSeedForbidden):
            assert_demo_target(url, "development", force=force)

    def test_a_forbidden_target_is_checked_before_the_force_shortcut_of_the_local_guard(self):
        with pytest.raises(DemoSeedForbidden):
            assert_demo_target(SUPABASE_DIRECT, "production", force=True)


class TestMessagesNeverLeakSecrets:
    @pytest.mark.parametrize(
        ("url", "environment", "force"),
        [
            (SUPABASE_POOLER, "development", True),
            (SUPABASE_DIRECT, "development", False),
            (LOCAL, "production", True),
            ("postgresql://u:s3cr3tpass@10.0.0.5:5432/rgb", "development", False),
            ("not a url :: s3cr3tpass", "development", False),
        ],
    )
    def test_the_message_has_no_credentials_user_or_project_reference(
        self, url, environment, force
    ):
        with pytest.raises((DemoSeedForbidden, NonLocalDatabase)) as error:
            assert_demo_target(url, environment, force=force)

        message = str(error.value)
        for secret in ("s3cr3tpass", "postgres.abcdefgh", "abcdefgh", "rgb:rgb", "postgresql://"):
            assert secret not in message
