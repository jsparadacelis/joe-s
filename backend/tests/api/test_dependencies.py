from typing import Annotated

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from backend.app.api.dependencies import contexto_de_solicitud, get_settings
from backend.app.estudio.domain.contexto import ContextoDeSolicitud, Rol
from backend.app.shared.config import Settings


def a_client(settings):
    app = FastAPI()
    app.dependency_overrides[get_settings] = lambda: settings

    @app.get("/contexto")
    def read(context: Annotated[ContextoDeSolicitud, Depends(contexto_de_solicitud)]):
        return {"estudio": context.estudio_id, "usuario": context.usuario_id, "rol": context.rol}

    return TestClient(app)


def test_development_context_comes_from_settings():
    settings = Settings(
        _env_file=None, dev_estudio_id="estudio-ficticio", dev_usuario_id="usuario-ficticio"
    )
    client = a_client(settings)

    response = client.get("/contexto")

    assert response.json() == {
        "estudio": "estudio-ficticio",
        "usuario": "usuario-ficticio",
        "rol": Rol.SOCIO.value,
    }


def test_development_role_and_qualifications_come_from_settings():
    settings = Settings(
        _env_file=None, dev_rol="arquitecto", dev_habilitaciones="sponsor,firmante_habilitado"
    )
    app = FastAPI()
    app.dependency_overrides[get_settings] = lambda: settings

    @app.get("/habilitaciones")
    def read(context: Annotated[ContextoDeSolicitud, Depends(contexto_de_solicitud)]):
        return {
            "rol": context.rol,
            "habilitaciones": sorted(h.value for h in context.habilitaciones),
        }

    response = TestClient(app).get("/habilitaciones")

    assert response.json() == {
        "rol": "arquitecto",
        "habilitaciones": ["firmante_habilitado", "sponsor"],
    }
