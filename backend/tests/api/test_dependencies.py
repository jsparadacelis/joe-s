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
