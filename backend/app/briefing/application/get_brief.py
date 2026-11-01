"""Read the brief (RGB-32). Read-only: nothing is saved.

In phase 2 the brief is the live draft with a live photo of the technical data; from phase 3 on
the frozen version 1 is returned as it was (never rebuilt). Permissions are decided here.
"""

from __future__ import annotations

from backend.app.access.application.actors import decide
from backend.app.access.domain.actions import Action as Permission
from backend.app.access.domain.ports import ProjectRoleReader
from backend.app.briefing.application.view import frozen_view, live_view
from backend.app.briefing.domain.brief import BRIEF_KEY, BRIEF_PHASE, ProjectBrief
from backend.app.briefing.domain.errors import BriefNotFound, ProjectNotFound
from backend.app.briefing.domain.ports import Briefs
from backend.app.study.domain.context import RequestContext
from backend.app.technical_data.domain.ports import TechnicalDataRepository


class GetBrief:
    def __init__(
        self, briefs: Briefs, technical: TechnicalDataRepository, roles: ProjectRoleReader
    ) -> None:
        self._briefs = briefs
        self._technical = technical
        self._roles = roles

    def read(self, context: RequestContext, code: str) -> ProjectBrief:
        project = self._briefs.get_project(code)
        if project is None:
            raise ProjectNotFound(code)
        if project.current_phase < BRIEF_PHASE:
            raise BriefNotFound()
        if project.current_phase > BRIEF_PHASE:
            frozen = self._briefs.get_frozen(project.id, BRIEF_PHASE)
            if frozen is not None and BRIEF_KEY in frozen:
                return frozen_view(project, frozen)
        roles = self._roles.roles_of(project.id, context.user_id)
        authorized = decide(context, Permission.PROMOTE, project.id, BRIEF_PHASE, roles).allowed
        return live_view(
            project,
            self._briefs.get_brief(project.id),
            self._technical.load(project.id),
            self._technical.last_query(project.id),
            authorized=authorized,
        )
