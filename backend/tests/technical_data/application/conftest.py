"""Simulated ports for the technical data use cases."""

from unittest.mock import create_autospec

import pytest

from backend.app.access.domain.ports import ProjectRoleReader
from backend.app.access.domain.project_roles import ProjectRole
from backend.app.audit.domain.ports import AuditLog
from backend.app.technical_data.domain.ports import TechnicalDataRepository, TechnicalProjects
from backend.tests.technical_data.application.support import a_project, a_row, a_sheet


@pytest.fixture
def projects():
    stub = create_autospec(TechnicalProjects, spec_set=True, instance=True)
    stub.find.return_value = a_project()
    return stub


@pytest.fixture
def data():
    stub = create_autospec(TechnicalDataRepository, spec_set=True, instance=True)
    stub.load.return_value = a_sheet(a_row("builtArea", "142"), a_row("year", "1958"))
    stub.last_query.return_value = None
    return stub


@pytest.fixture
def roles():
    stub = create_autospec(ProjectRoleReader, spec_set=True, instance=True)
    stub.roles_of.return_value = frozenset({ProjectRole.PROJECT_DIRECTOR})
    return stub


@pytest.fixture
def audit_log():
    return create_autospec(AuditLog, spec_set=True, instance=True)
