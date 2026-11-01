"""GET /api/to-promote with a simulated use case: shape, order as given, read only, 401."""

from contextlib import contextmanager
from unittest.mock import create_autospec

import pytest
from fastapi.testclient import TestClient

from backend.app.api.dependencies import get_settings, to_promote_unit_of_work
from backend.app.api.main import create_app
from backend.app.study.domain.context import Role
from backend.app.to_promote.application.queue import ToPromoteItem, ToPromoteList, ToPromoteQueue
from backend.tests.api.auth_support import dev_settings, supabase_client

URL = "/api/to-promote"


def an_item(**overrides):
    values = {
        "code": "PRY-T-001",
        "name": "House (sample)",
        "phase": 2,
        "phase_name": "Briefing y concepto",
        "deliverable": "Brief (sample)",
        "state": "ready",
        "reason": None,
        "promoter": "Director de proyecto",
        "can_promote": True,
    }
    return ToPromoteItem(**{**values, **overrides})


@pytest.fixture
def queue():
    return create_autospec(ToPromoteQueue, spec_set=True, instance=True)


def make_client(queue, **settings_overrides):
    settings = dev_settings(**settings_overrides)
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    contexts = []

    @contextmanager
    def fake_unit(context):
        contexts.append(context)
        yield queue

    app.dependency_overrides[to_promote_unit_of_work] = lambda: fake_unit
    client = TestClient(app)
    client.contexts = contexts
    return client


def test_answers_the_counter_and_the_projects_with_english_keys(queue):
    queue.execute.return_value = ToPromoteList(
        1,
        [
            an_item(),
            an_item(
                code="PRY-T-002",
                state="blocked",
                reason="En pausa; reanudación prevista el 20/11/2026.",
                can_promote=False,
            ),
        ],
    )

    response = make_client(queue).get(URL)

    assert response.status_code == 200
    assert response.json() == {
        "ready_count": 1,
        "projects": [
            {
                "code": "PRY-T-001",
                "name": "House (sample)",
                "phase": 2,
                "phase_name": "Briefing y concepto",
                "deliverable": "Brief (sample)",
                "state": "ready",
                "reason": None,
                "promoter": "Director de proyecto",
                "can_promote": True,
            },
            {
                "code": "PRY-T-002",
                "name": "House (sample)",
                "phase": 2,
                "phase_name": "Briefing y concepto",
                "deliverable": "Brief (sample)",
                "state": "blocked",
                "reason": "En pausa; reanudación prevista el 20/11/2026.",
                "promoter": "Director de proyecto",
                "can_promote": False,
            },
        ],
    }


def test_an_empty_list_is_a_zero_counter_and_no_projects(queue):
    queue.execute.return_value = ToPromoteList(0, [])

    response = make_client(queue).get(URL)

    assert response.json() == {"ready_count": 0, "projects": []}


@pytest.mark.parametrize("role", [r.value for r in Role])
def test_any_person_of_the_study_may_read_it(queue, role):
    queue.execute.return_value = ToPromoteList(0, [])
    client = make_client(queue, dev_role=role)

    assert client.get(URL).status_code == 200
    assert client.contexts[0].role.value == role


def test_the_use_case_receives_the_request_context(queue):
    queue.execute.return_value = ToPromoteList(0, [])
    client = make_client(queue, dev_user_id="someone")

    client.get(URL)

    queue.execute.assert_called_once_with(client.contexts[0])
    assert client.contexts[0].user_id == "someone"


@pytest.mark.parametrize("method", ["post", "put", "patch", "delete"])
def test_it_only_reads(queue, method):
    client = make_client(queue)

    assert getattr(client, method)(URL).status_code == 405
    queue.execute.assert_not_called()


def test_without_a_token_it_answers_401():
    assert supabase_client(None).get(URL).status_code == 401
