"""Auditoría inalterable con Postgres real: solo inserción, aislada por estudio."""

import psycopg
import pytest

from backend.app.auditoria.domain.evento import EventoDeAuditoria, Resultado
from backend.app.auditoria.infrastructure.postgres_registro import PostgresRegistroDeAuditoria
from backend.app.estudio.domain.contexto import ContextoDeSolicitud, Rol
from backend.app.shared.db import transaccion_de_estudio
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations

pytestmark = pytest.mark.integration

ESTUDIO_A = "11111111-1111-1111-1111-111111111111"
ESTUDIO_B = "22222222-2222-2222-2222-222222222222"


def a_context(estudio_id):
    return ContextoDeSolicitud(estudio_id=estudio_id, usuario_id="usuario-demo", rol=Rol.SOCIO)


def an_event(estudio_id=ESTUDIO_A, **overrides):
    values = {
        "estudio_id": estudio_id,
        "usuario_id": "usuario-demo",
        "entidad": "proyecto",
        "entidad_id": "PRY-EJ-001",
        "accion": "promover",
        "valor_anterior": {"fase": 2},
        "valor_nuevo": {"fase": 3},
        "version": 1,
    }
    return EventoDeAuditoria(**{**values, **overrides})


@pytest.fixture
def url(schema_url):
    url, _ = schema_url
    apply_migrations(url, MIGRATIONS_DIR)
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(
            "INSERT INTO estudios (id, nombre) VALUES (%s, 'A (ejemplo)'), (%s, 'B (ejemplo)')",
            (ESTUDIO_A, ESTUDIO_B),
        )
    return url


@pytest.fixture
def stored_event(url):
    with transaccion_de_estudio(url, a_context(ESTUDIO_A)) as conn:
        PostgresRegistroDeAuditoria(conn).registrar(an_event())
    return url


class TestRegistrar:
    def test_stores_who_what_when_before_after_version_and_result(self, stored_event):
        with transaccion_de_estudio(stored_event, a_context(ESTUDIO_A)) as conn:
            row = conn.execute(
                "SELECT estudio_id::text, usuario_id, entidad, entidad_id, accion, version, "
                "valor_anterior, valor_nuevo, resultado, creado_en IS NOT NULL "
                "FROM eventos_auditoria"
            ).fetchone()

        assert row == (
            ESTUDIO_A,
            "usuario-demo",
            "proyecto",
            "PRY-EJ-001",
            "promover",
            1,
            {"fase": 2},
            {"fase": 3},
            "ok",
            True,
        )

    def test_stores_a_rejected_result(self, url):
        with transaccion_de_estudio(url, a_context(ESTUDIO_A)) as conn:
            PostgresRegistroDeAuditoria(conn).registrar(an_event(resultado=Resultado.RECHAZADO))
            result = conn.execute("SELECT resultado FROM eventos_auditoria").fetchone()[0]

        assert result == "rechazado"

    def test_event_rolls_back_with_the_business_transaction(self, url):
        with pytest.raises(RuntimeError):
            with transaccion_de_estudio(url, a_context(ESTUDIO_A)) as conn:
                PostgresRegistroDeAuditoria(conn).registrar(an_event())
                raise RuntimeError("falla el cambio de negocio")

        with psycopg.connect(url) as admin:
            count = admin.execute("SELECT count(*) FROM eventos_auditoria").fetchone()[0]
        assert count == 0


class TestInalterable:
    @pytest.mark.parametrize(
        "statement",
        ["UPDATE eventos_auditoria SET accion = 'otra'", "DELETE FROM eventos_auditoria"],
    )
    def test_app_role_cannot_update_or_delete(self, stored_event, statement):
        with transaccion_de_estudio(stored_event, a_context(ESTUDIO_A)) as conn:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute(statement)

    def test_app_role_cannot_truncate(self, stored_event):
        with transaccion_de_estudio(stored_event, a_context(ESTUDIO_A)) as conn:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute("TRUNCATE eventos_auditoria")

    @pytest.mark.parametrize(
        "statement",
        [
            "UPDATE eventos_auditoria SET accion = 'otra'",
            "DELETE FROM eventos_auditoria",
            "TRUNCATE eventos_auditoria",
        ],
    )
    def test_not_even_the_table_owner_can_alter_events(self, stored_event, statement):
        with psycopg.connect(stored_event) as owner:
            with pytest.raises(psycopg.Error, match="inalterable"):
                owner.execute(statement)


class TestAislamiento:
    def test_study_does_not_see_events_of_another_study(self, stored_event):
        with transaccion_de_estudio(stored_event, a_context(ESTUDIO_B)) as conn:
            count = conn.execute("SELECT count(*) FROM eventos_auditoria").fetchone()[0]

        assert count == 0

    def test_study_cannot_write_events_for_another_study(self, url):
        with transaccion_de_estudio(url, a_context(ESTUDIO_A)) as conn:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                PostgresRegistroDeAuditoria(conn).registrar(an_event(estudio_id=ESTUDIO_B))
