import psycopg
import pytest

from backend.app.estudio.domain.contexto import ContextoDeSolicitud, Rol
from backend.app.shared.db import transaccion_de_estudio
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations

pytestmark = pytest.mark.integration

ESTUDIO = "11111111-1111-1111-1111-111111111111"


@pytest.fixture
def url(schema_url):
    url, _ = schema_url
    apply_migrations(url, MIGRATIONS_DIR)
    return url


def a_context(estudio_id=ESTUDIO):
    return ContextoDeSolicitud(estudio_id=estudio_id, usuario_id="usuario-demo", rol=Rol.SOCIO)


class TestTransaccionDeEstudio:
    def test_sets_study_and_runs_as_the_restricted_role(self, url):
        with transaccion_de_estudio(url, a_context()) as conn:
            study = conn.execute("SELECT app_estudio_id()").fetchone()[0]
            role = conn.execute("SELECT current_user").fetchone()[0]

        assert (study, role) == (ESTUDIO, "rgb_app")

    def test_setting_does_not_leak_after_commit(self, url):
        with transaccion_de_estudio(url, a_context()):
            pass

        with psycopg.connect(url) as conn:
            leaked = conn.execute("SELECT app_estudio_id()").fetchone()[0]
        assert leaked in (None, "")

    def test_commits_on_success_and_rolls_back_on_error(self, url):
        with psycopg.connect(url, autocommit=True) as admin:
            admin.execute(
                "INSERT INTO estudios (id, nombre) VALUES (%s, 'A (ejemplo)')", (ESTUDIO,)
            )

        with transaccion_de_estudio(url, a_context()) as conn:
            conn.execute("UPDATE estudios SET nombre = 'Renombrado (ejemplo)'")
        with pytest.raises(RuntimeError):
            with transaccion_de_estudio(url, a_context()) as conn:
                conn.execute("UPDATE estudios SET nombre = 'No debe quedar'")
                raise RuntimeError("fallo")

        with psycopg.connect(url) as admin:
            name = admin.execute("SELECT nombre FROM estudios").fetchone()[0]
        assert name == "Renombrado (ejemplo)"
