"""Servicio de promoción de punta a punta contra Postgres real y con RLS."""

from unittest.mock import create_autospec

import psycopg
import pytest

from backend.app.auditoria.domain.ports import RegistroDeAuditoria
from backend.app.auditoria.infrastructure.postgres_registro import PostgresRegistroDeAuditoria
from backend.app.ciclo_de_vida.application.servicio_promocion import ServicioDePromocion
from backend.app.ciclo_de_vida.domain.errores import ProyectoNoEncontrado
from backend.app.ciclo_de_vida.infrastructure.postgres_ciclo_de_vida import PostgresCicloDeVida
from backend.app.estudio.domain.contexto import ContextoDeSolicitud, Rol
from backend.app.shared.db import transaccion_de_estudio
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations

pytestmark = pytest.mark.integration

ESTUDIO_A = "11111111-1111-1111-1111-111111111111"
ESTUDIO_B = "22222222-2222-2222-2222-222222222222"
PROYECTO = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
CODIGO = "PRY-EJ-001"


def a_context(estudio_id=ESTUDIO_A, rol=Rol.DIRECTOR_DE_PROYECTO):
    return ContextoDeSolicitud(estudio_id=estudio_id, usuario_id="usuario-demo", rol=rol)


@pytest.fixture
def url(schema_url):
    url, _ = schema_url
    apply_migrations(url, MIGRATIONS_DIR)
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(
            "INSERT INTO estudios (id, nombre) VALUES (%s, 'A (ejemplo)'), (%s, 'B (ejemplo)')",
            (ESTUDIO_A, ESTUDIO_B),
        )
        admin.execute(
            "INSERT INTO proyectos (id, estudio_id, codigo, nombre, fase_actual) "
            "VALUES (%s, %s, %s, 'Vivienda (ejemplo)', 2)",
            (PROYECTO, ESTUDIO_A, CODIGO),
        )
        admin.execute(
            "INSERT INTO entregables_salida (estudio_id, proyecto_id, fase, contenido, completo, "
            'aprobado) VALUES (%s, %s, 2, \'{"titulo": "Brief (ejemplo)"}\', true, true)',
            (ESTUDIO_A, PROYECTO),
        )
    return url


def run(url, action, context=None, registro=None, **kwargs):
    context = context or a_context()
    with transaccion_de_estudio(url, context) as conn:
        service = ServicioDePromocion(
            PostgresCicloDeVida(conn), registro or PostgresRegistroDeAuditoria(conn), {}
        )
        return getattr(service, action)(context, CODIGO, **kwargs)


def query(url, sql):
    with psycopg.connect(url) as admin:
        return admin.execute(sql).fetchall()


class TestPromover:
    def test_moves_freezes_records_opens_and_audits_in_one_go(self, url):
        transition = run(url, "promover")

        assert (transition.ok, transition.fase_actual, transition.version_congelada) == (True, 3, 1)
        assert query(url, "SELECT fase_actual FROM proyectos") == [(3,)]
        assert query(url, "SELECT fase, version, contenido FROM versiones_congeladas") == [
            (2, 1, {"titulo": "Brief (ejemplo)"})
        ]
        assert query(
            url, "SELECT accion, de_fase, a_fase, usuario_id, resultado FROM promociones"
        ) == [("promover", 2, 3, "usuario-demo", "ok")]
        assert query(url, "SELECT fase FROM entregables_salida ORDER BY fase") == [(2,), (3,)]
        assert query(
            url,
            "SELECT accion, resultado, version, valor_anterior, valor_nuevo FROM eventos_auditoria",
        ) == [("promover", "ok", 1, {"fase": 2}, {"fase": 3})]

    def test_the_next_promotion_freezes_the_next_version_of_its_own_phase(self, url):
        run(url, "promover")
        with psycopg.connect(url, autocommit=True) as admin:
            admin.execute(
                "UPDATE entregables_salida SET completo = true, aprobado = true WHERE fase = 3"
            )

        run(url, "promover")

        assert query(url, "SELECT fase, version FROM versiones_congeladas ORDER BY fase") == [
            (2, 1),
            (3, 1),
        ]

    def test_promoting_again_the_same_phase_after_a_hold_freezes_version_two(self, url):
        with psycopg.connect(url, autocommit=True) as admin:
            admin.execute(
                "INSERT INTO versiones_congeladas (estudio_id, proyecto_id, fase, version, contenido, "
                "congelada_por) VALUES (%s, %s, 2, 1, '{}', 'usuario-demo')",
                (ESTUDIO_A, PROYECTO),
            )

        transition = run(url, "promover")

        assert transition.version_congelada == 2

    def test_a_failure_halfway_rolls_back_everything(self, url):
        broken = create_autospec(RegistroDeAuditoria, spec_set=True, instance=True)
        broken.registrar.side_effect = RuntimeError("falla la auditoría")

        with pytest.raises(RuntimeError):
            run(url, "promover", registro=broken)

        assert query(url, "SELECT fase_actual FROM proyectos") == [(2,)]
        assert query(url, "SELECT count(*) FROM versiones_congeladas") == [(0,)]
        assert query(url, "SELECT count(*) FROM promociones") == [(0,)]


class TestRechazos:
    def test_without_authority_nothing_changes_but_the_attempt_is_audited(self, url):
        transition = run(url, "promover", a_context(rol=Rol.ARQUITECTO))

        assert transition.ok is False
        assert query(url, "SELECT fase_actual FROM proyectos") == [(2,)]
        assert query(url, "SELECT count(*) FROM versiones_congeladas") == [(0,)]
        assert query(url, "SELECT accion, resultado, valor_nuevo FROM eventos_auditoria") == [
            ("promover", "rechazado", {"error": "sin_autoridad"})
        ]

    def test_incomplete_deliverable_blocks_and_is_audited(self, url):
        with psycopg.connect(url, autocommit=True) as admin:
            admin.execute("UPDATE entregables_salida SET aprobado = false")

        transition = run(url, "promover")

        assert transition.error.faltantes == ["aprobación del entregable"]
        assert query(url, "SELECT fase_actual FROM proyectos") == [(2,)]
        assert query(url, "SELECT resultado FROM eventos_auditoria") == [("rechazado",)]

    def test_another_study_cannot_see_or_promote_the_project(self, url):
        with pytest.raises(ProyectoNoEncontrado):
            run(url, "promover", a_context(estudio_id=ESTUDIO_B))

        assert query(url, "SELECT fase_actual FROM proyectos") == [(2,)]


class TestRetenerYNoPerseguir:
    def test_hold_records_the_reason_without_moving(self, url):
        transition = run(url, "retener", motivo="Falta el topográfico")

        assert transition.ok is True
        assert query(url, "SELECT fase_actual FROM proyectos") == [(2,)]
        assert query(url, "SELECT accion, motivo, a_fase FROM promociones") == [
            ("retener", "Falta el topográfico", None)
        ]

    def test_do_not_pursue_records_the_decision_from_phase_zero(self, url):
        with psycopg.connect(url, autocommit=True) as admin:
            admin.execute("UPDATE proyectos SET fase_actual = 0")

        transition = run(url, "no_perseguir", a_context(rol=Rol.SOCIO), motivo="Fuera de umbral")

        assert transition.ok is True
        assert query(url, "SELECT accion, de_fase, motivo FROM promociones") == [
            ("no_perseguir", 0, "Fuera de umbral")
        ]
