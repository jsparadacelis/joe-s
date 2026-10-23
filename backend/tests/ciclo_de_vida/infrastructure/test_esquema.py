"""Reglas del modelo de ciclo de vida con Postgres real."""

import json

import psycopg
import pytest

from backend.app.ciclo_de_vida.domain.fases import FASES
from backend.app.estudio.domain.contexto import ContextoDeSolicitud, Rol
from backend.app.shared.db import transaccion_de_estudio
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations

pytestmark = pytest.mark.integration

ESTUDIO_A = "11111111-1111-1111-1111-111111111111"
ESTUDIO_B = "22222222-2222-2222-2222-222222222222"
PROYECTO_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

TABLAS_DE_ESTUDIO = [
    "proyectos",
    "entregables_salida",
    "versiones_congeladas",
    "promociones",
    "hitos_internos",
]


def a_context(estudio_id):
    return ContextoDeSolicitud(estudio_id=estudio_id, usuario_id="usuario-demo", rol=Rol.SOCIO)


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
            "VALUES (%s, %s, 'PRY-EJ-001', 'Vivienda (ejemplo)', 2)",
            (PROYECTO_A, ESTUDIO_A),
        )
    return url


def admin_execute(url, sql, params=()):
    with psycopg.connect(url, autocommit=True) as admin:
        return admin.execute(sql, params)


def freeze(url, version=1):
    admin_execute(
        url,
        "INSERT INTO versiones_congeladas (estudio_id, proyecto_id, fase, version, contenido, "
        "congelada_por) VALUES (%s, %s, 2, %s, %s, 'usuario-demo')",
        (ESTUDIO_A, PROYECTO_A, version, json.dumps({"titulo": "Brief (ejemplo)"})),
    )


class TestConfiguracionDeFases:
    def test_matches_the_domain_definitions(self, url):
        with psycopg.connect(url) as conn:
            rows = conn.execute(
                "SELECT id, nombre, entregable_salida, autoridad FROM fases_config ORDER BY id"
            ).fetchall()

        assert rows == [(f.id, f.nombre, f.entregable_salida, f.autoridad) for f in FASES]

    def test_app_role_can_read_but_not_change_it(self, url):
        with transaccion_de_estudio(url, a_context(ESTUDIO_A)) as conn:
            count = conn.execute("SELECT count(*) FROM fases_config").fetchone()[0]
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute("UPDATE fases_config SET nombre = 'x'")

        assert count == 8


class TestUnaSolaFase:
    def test_phase_is_required(self, url):
        with pytest.raises(psycopg.errors.NotNullViolation):
            admin_execute(
                url,
                "INSERT INTO proyectos (estudio_id, codigo, nombre, fase_actual) "
                "VALUES (%s, 'X', 'X', NULL)",
                (ESTUDIO_A,),
            )

    @pytest.mark.parametrize("phase", [-1, 8])
    def test_phase_must_exist(self, url, phase):
        with pytest.raises(psycopg.errors.ForeignKeyViolation):
            admin_execute(
                url,
                "INSERT INTO proyectos (estudio_id, codigo, nombre, fase_actual) "
                "VALUES (%s, 'X', 'X', %s)",
                (ESTUDIO_A, phase),
            )

    def test_code_is_unique_within_a_study_but_not_across_studies(self, url):
        admin_execute(
            url,
            "INSERT INTO proyectos (estudio_id, codigo, nombre, fase_actual) "
            "VALUES (%s, 'PRY-EJ-001', 'Otro estudio (ejemplo)', 0)",
            (ESTUDIO_B,),
        )

        with pytest.raises(psycopg.errors.UniqueViolation):
            admin_execute(
                url,
                "INSERT INTO proyectos (estudio_id, codigo, nombre, fase_actual) "
                "VALUES (%s, 'PRY-EJ-001', 'Duplicado', 0)",
                (ESTUDIO_A,),
            )


class TestActivo:
    ACTIVATE = (
        "UPDATE proyectos SET activo = true, responsable_id = %s, proximo_hito = %s, "
        "semaforo = %s WHERE id = %s"
    )

    def test_active_without_responsible_milestone_or_traffic_light_is_rejected(self, url):
        with pytest.raises(psycopg.errors.CheckViolation):
            admin_execute(url, "UPDATE proyectos SET activo = true WHERE id = %s", (PROYECTO_A,))

    def test_active_with_everything_is_accepted(self, url):
        admin_execute(
            url, self.ACTIVATE, ("usuario-demo", "Entrega del brief", "verde", PROYECTO_A)
        )

        active = admin_execute(url, "SELECT activo FROM proyectos").fetchone()[0]
        assert active is True

    def test_cannot_remove_a_required_field_while_active(self, url):
        admin_execute(
            url, self.ACTIVATE, ("usuario-demo", "Entrega del brief", "verde", PROYECTO_A)
        )

        with pytest.raises(psycopg.errors.CheckViolation):
            admin_execute(
                url, "UPDATE proyectos SET proximo_hito = NULL WHERE id = %s", (PROYECTO_A,)
            )

    def test_traffic_light_only_accepts_known_values(self, url):
        with pytest.raises(psycopg.errors.CheckViolation):
            admin_execute(
                url, "UPDATE proyectos SET semaforo = 'azul' WHERE id = %s", (PROYECTO_A,)
            )


class TestEntregableDeSalida:
    INSERT = (
        "INSERT INTO entregables_salida (estudio_id, proyecto_id, fase, contenido, completo, aprobado) "
        "VALUES (%s, %s, 2, '{}', %s, %s)"
    )

    def test_one_per_project_and_phase(self, url):
        admin_execute(url, self.INSERT, (ESTUDIO_A, PROYECTO_A, False, False))

        with pytest.raises(psycopg.errors.UniqueViolation):
            admin_execute(url, self.INSERT, (ESTUDIO_A, PROYECTO_A, False, False))

    def test_cannot_be_approved_without_being_complete(self, url):
        with pytest.raises(psycopg.errors.CheckViolation):
            admin_execute(url, self.INSERT, (ESTUDIO_A, PROYECTO_A, False, True))

    def test_child_cannot_hang_from_a_project_of_another_study(self, url):
        with pytest.raises(psycopg.errors.ForeignKeyViolation):
            admin_execute(url, self.INSERT, (ESTUDIO_B, PROYECTO_A, False, False))


class TestVersionCongelada:
    def test_version_is_unique_per_project_and_phase(self, url):
        freeze(url)

        with pytest.raises(psycopg.errors.UniqueViolation):
            freeze(url)

    @pytest.mark.parametrize(
        "statement",
        ["UPDATE versiones_congeladas SET contenido = '{}'", "DELETE FROM versiones_congeladas"],
    )
    def test_app_role_cannot_modify_or_delete_it(self, url, statement):
        freeze(url)

        with transaccion_de_estudio(url, a_context(ESTUDIO_A)) as conn:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute(statement)

    @pytest.mark.parametrize(
        "statement",
        [
            "UPDATE versiones_congeladas SET contenido = '{}'",
            "DELETE FROM versiones_congeladas",
            "TRUNCATE versiones_congeladas",
        ],
    )
    def test_not_even_the_owner_can_modify_it(self, url, statement):
        freeze(url)

        with pytest.raises(psycopg.Error, match="inalterable"):
            admin_execute(url, statement)


class TestPromociones:
    INSERT = (
        "INSERT INTO promociones (estudio_id, proyecto_id, accion, de_fase, a_fase, usuario_id, "
        "motivo) VALUES (%s, %s, %s, %s, %s, 'usuario-demo', %s)"
    )

    def test_a_valid_promotion_is_stored_with_who_and_when(self, url):
        admin_execute(url, self.INSERT, (ESTUDIO_A, PROYECTO_A, "promover", 2, 3, None))

        row = admin_execute(
            url, "SELECT usuario_id, resultado, creado_en IS NOT NULL FROM promociones"
        ).fetchone()
        assert row == ("usuario-demo", "ok", True)

    @pytest.mark.parametrize(
        ("accion", "de", "a", "motivo"),
        [
            ("promover", 2, 4, None),
            ("promover", 2, None, None),
            ("retener", 2, None, None),
            ("retener", 2, None, "  "),
            ("retener", 2, 3, "motivo"),
            ("no_perseguir", 1, None, "motivo"),
            ("no_perseguir", 0, None, None),
            ("desconocida", 2, 3, None),
        ],
    )
    def test_invalid_combinations_are_rejected(self, url, accion, de, a, motivo):
        with pytest.raises(psycopg.errors.CheckViolation):
            admin_execute(url, self.INSERT, (ESTUDIO_A, PROYECTO_A, accion, de, a, motivo))

    def test_valid_hold_and_do_not_pursue_are_accepted(self, url):
        admin_execute(url, self.INSERT, (ESTUDIO_A, PROYECTO_A, "retener", 2, None, "Falta algo"))
        admin_execute(url, self.INSERT, (ESTUDIO_A, PROYECTO_A, "no_perseguir", 0, None, "Umbral"))

        count = admin_execute(url, "SELECT count(*) FROM promociones").fetchone()[0]
        assert count == 2

    @pytest.mark.parametrize(
        "statement", ["UPDATE promociones SET motivo = 'x'", "DELETE FROM promociones"]
    )
    def test_history_cannot_be_rewritten(self, url, statement):
        admin_execute(url, self.INSERT, (ESTUDIO_A, PROYECTO_A, "promover", 2, 3, None))

        with transaccion_de_estudio(url, a_context(ESTUDIO_A)) as conn:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute(statement)
        with pytest.raises(psycopg.Error, match="inalterable"):
            admin_execute(url, statement)


class TestHitosInternos:
    def test_stores_a_milestone_inside_a_phase(self, url):
        admin_execute(
            url,
            "INSERT INTO hitos_internos (estudio_id, proyecto_id, fase, nombre) "
            "VALUES (%s, %s, 6, 'Licencia')",
            (ESTUDIO_A, PROYECTO_A),
        )

        name = admin_execute(url, "SELECT nombre FROM hitos_internos").fetchone()[0]
        assert name == "Licencia"


class TestAislamientoEntreEstudios:
    @pytest.mark.parametrize("tabla", TABLAS_DE_ESTUDIO)
    def test_other_study_sees_nothing(self, url, tabla):
        admin_execute(
            url,
            "INSERT INTO entregables_salida (estudio_id, proyecto_id, fase) VALUES (%s, %s, 2)",
            (ESTUDIO_A, PROYECTO_A),
        )
        freeze(url)
        admin_execute(
            url,
            "INSERT INTO promociones (estudio_id, proyecto_id, accion, de_fase, a_fase, usuario_id) "
            "VALUES (%s, %s, 'promover', 2, 3, 'usuario-demo')",
            (ESTUDIO_A, PROYECTO_A),
        )
        admin_execute(
            url,
            "INSERT INTO hitos_internos (estudio_id, proyecto_id, fase, nombre) "
            "VALUES (%s, %s, 6, 'Licencia')",
            (ESTUDIO_A, PROYECTO_A),
        )

        with transaccion_de_estudio(url, a_context(ESTUDIO_B)) as conn:
            count = conn.execute(f"SELECT count(*) FROM {tabla}").fetchone()[0]

        assert count == 0

    def test_study_cannot_create_a_project_for_another_study(self, url):
        with transaccion_de_estudio(url, a_context(ESTUDIO_A)) as conn:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute(
                    "INSERT INTO proyectos (estudio_id, codigo, nombre, fase_actual) "
                    "VALUES (%s, 'X', 'X', 0)",
                    (ESTUDIO_B,),
                )
