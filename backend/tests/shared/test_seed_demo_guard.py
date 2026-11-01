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


class TestCommandLine:
    @pytest.fixture(autouse=True)
    def never_seeds(self, monkeypatch):
        calls = []

        def fake(*args, **kwargs):
            calls.append(args)
            raise AssertionError("the seed must not run")

        monkeypatch.setattr("backend.app.shared.seed_demo.seed_demo", fake)
        self.calls = calls

    def run(self, monkeypatch, capsys, argv=(), **env):
        from backend.app.shared.seed_demo import main

        for name in ("DATABASE_URL", "ENVIRONMENT", "DEV_STUDY_ID"):
            monkeypatch.delenv(name, raising=False)
        for name, value in env.items():
            monkeypatch.setenv(name, value)
        code = main(list(argv))
        return code, capsys.readouterr()

    def test_refuses_production_even_with_force_and_a_local_url(self, monkeypatch, capsys):
        code, out = self.run(
            monkeypatch, capsys, ["--force"], DATABASE_URL=LOCAL, ENVIRONMENT="production"
        )

        assert code == 1
        assert "rgb:rgb" not in out.err + out.out
        assert self.calls == []

    def test_refuses_supabase_even_with_force_without_leaking_the_url(self, monkeypatch, capsys):
        code, out = self.run(
            monkeypatch,
            capsys,
            ["--force"],
            DATABASE_URL=SUPABASE_POOLER,
            ENVIRONMENT="development",
        )

        assert code == 1
        assert "s3cr3tpass" not in out.err + out.out
        assert self.calls == []

    def test_refuses_a_remote_host_without_force(self, monkeypatch, capsys):
        code, out = self.run(
            monkeypatch,
            capsys,
            DATABASE_URL="postgresql://u:s3cr3tpass@10.0.0.5/rgb",
            ENVIRONMENT="development",
        )

        assert code == 1
        assert "s3cr3tpass" not in out.err + out.out
        assert self.calls == []

    def test_refuses_when_the_dev_study_would_be_the_demo_study(self, monkeypatch, capsys):
        from backend.app.shared.demo_data import DEMO_STUDY_ID

        code, _ = self.run(
            monkeypatch,
            capsys,
            DATABASE_URL=LOCAL,
            ENVIRONMENT="development",
            DEV_STUDY_ID=DEMO_STUDY_ID,
        )

        assert code == 1
        assert self.calls == []

    def test_a_database_error_is_reported_without_the_connection_string(self, monkeypatch, capsys):
        import psycopg

        def unreachable(*args, **kwargs):
            raise psycopg.OperationalError("connection to postgresql://rgb:rgb@localhost failed")

        monkeypatch.setattr("backend.app.shared.seed_demo.seed_demo", unreachable)

        code, out = self.run(monkeypatch, capsys, DATABASE_URL=LOCAL, ENVIRONMENT="development")

        assert code == 1
        assert "rgb:rgb" not in out.err + out.out
