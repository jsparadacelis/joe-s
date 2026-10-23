from typing import Annotated

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from backend.app.api.dependencies import get_settings, request_context
from backend.app.shared.config import Settings
from backend.app.study.domain.context import RequestContext, Role


def a_client(settings):
    app = FastAPI()
    app.dependency_overrides[get_settings] = lambda: settings

    @app.get("/context")
    def read(context: Annotated[RequestContext, Depends(request_context)]):
        return {"study": context.study_id, "user": context.user_id, "role": context.role}

    return TestClient(app)


def test_development_context_comes_from_settings():
    settings = Settings(_env_file=None, dev_study_id="sample-study", dev_user_id="sample-user")
    client = a_client(settings)

    response = client.get("/context")

    assert response.json() == {
        "study": "sample-study",
        "user": "sample-user",
        "role": Role.PARTNER.value,
    }


def test_development_role_and_qualifications_come_from_settings():
    settings = Settings(
        _env_file=None, dev_role="architect", dev_qualifications="sponsor,licensed_signatory"
    )
    app = FastAPI()
    app.dependency_overrides[get_settings] = lambda: settings

    @app.get("/qualifications")
    def read(context: Annotated[RequestContext, Depends(request_context)]):
        return {
            "role": context.role,
            "qualifications": sorted(h.value for h in context.qualifications),
        }

    response = TestClient(app).get("/qualifications")

    assert response.json() == {
        "role": "architect",
        "qualifications": ["licensed_signatory", "sponsor"],
    }
