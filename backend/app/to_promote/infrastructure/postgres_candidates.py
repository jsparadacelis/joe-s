"""Postgres adapter of the "to promote" reads. RLS limits every query to the study.

Four reads load the whole list, whatever the number of projects: the projects with their pause,
seniority and current deliverable; the sheet inputs of the projects in phase 1; and the technical
data and last cadastral query of the projects in phase 2.
"""

from __future__ import annotations

from collections import defaultdict

import psycopg

from backend.app.lifecycle.domain.deliverable import ExitDeliverable
from backend.app.opportunity.domain.plan import ProjectType, Scale
from backend.app.opportunity.domain.project_plan import ConfirmedPlan
from backend.app.opportunity.domain.project_sheet import SheetProject
from backend.app.technical_data.domain.catalog import Source
from backend.app.technical_data.domain.datum import TechnicalDatum
from backend.app.technical_data.domain.ports import QueryRecord
from backend.app.technical_data.domain.technical_data import TechnicalData
from backend.app.to_promote.domain.candidate import Candidate, SheetInputs, TechnicalInputs

# At most one open pause per project (partial unique index). Phase 7 (closing) has nothing to
# promote to, and a project the study decided not to pursue is out of the list.
_PROJECTS = (
    "SELECT p.id::text, p.code, p.name, p.current_phase, p.paused, o.expected_resumption, "
    "coalesce((SELECT max(pr.created_at) FROM promotions pr WHERE pr.project_id = p.id "
    "AND pr.action = 'promote' AND pr.outcome = 'ok' AND pr.to_phase = p.current_phase), "
    "p.created_at), "
    "d.phase, d.content, d.complete, d.approved, "
    "EXISTS (SELECT 1 FROM opportunity_scorings s WHERE s.project_id = p.id) "
    "FROM projects p "
    "LEFT JOIN pauses o ON o.project_id = p.id AND o.resumed_on IS NULL "
    "LEFT JOIN exit_deliverables d ON d.project_id = p.id AND d.phase = p.current_phase "
    "WHERE p.current_phase < 7 AND NOT EXISTS ("
    "SELECT 1 FROM promotions x WHERE x.project_id = p.id AND x.action = 'do_not_pursue' "
    "AND x.outcome = 'ok') "
    "ORDER BY p.code"
)

_SHEETS = (
    "SELECT p.id::text, p.code, p.current_phase, p.name, o.client, o.location, o.project_type, "
    "p.traffic_light, pl.project_type, pl.scale, pl.weeks, pl.confirmed_by, pl.confirmed_at "
    "FROM projects p "
    "JOIN opportunities o ON o.project_id = p.id AND o.study_id = p.study_id "
    "LEFT JOIN project_plans pl ON pl.project_id = p.id "
    "WHERE p.current_phase = 1"
)

_TECHNICAL_DATA = (
    "SELECT t.project_id::text, t.field_id, t.value, t.source, t.original, t.verified "
    "FROM technical_data t JOIN projects p ON p.id = t.project_id WHERE p.current_phase = 2"
)

_QUERIES = (
    "SELECT q.project_id::text, q.cadastral_reference, q.queried_at "
    "FROM technical_data_queries q JOIN projects p ON p.id = q.project_id "
    "WHERE p.current_phase = 2"
)


class PostgresCandidates:
    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def list_candidates(self) -> list[Candidate]:
        rows = self._conn.execute(_PROJECTS).fetchall()
        phases = {row[3] for row in rows}
        sheets = self._sheets() if 1 in phases else {}
        technical = self._technical() if 2 in phases else {}
        return [_candidate(row, sheets, technical) for row in rows]

    def _sheets(self) -> dict[str, tuple[SheetProject, ConfirmedPlan | None]]:
        sheets = {}
        for row in self._conn.execute(_SHEETS).fetchall():
            project = SheetProject(*row[:6], ProjectType(row[6]), row[7])
            plan = None
            if row[8] is not None:
                plan = ConfirmedPlan(
                    project_code=row[1],
                    project_type=ProjectType(row[8]),
                    scale=Scale(row[9]),
                    weeks=tuple(row[10]),
                    confirmed_by=row[11],
                    confirmed_at=row[12],
                )
            sheets[row[0]] = (project, plan)
        return sheets

    def _technical(self) -> dict[str, TechnicalInputs]:
        data = defaultdict(list)
        for project_id, field_id, value, source, original, verified in self._conn.execute(
            _TECHNICAL_DATA
        ).fetchall():
            data[project_id].append(
                TechnicalDatum(field_id, value, Source(source), original, verified)
            )
        queries = {
            project_id: QueryRecord(reference, queried_at)
            for project_id, reference, queried_at in self._conn.execute(_QUERIES).fetchall()
        }
        return {
            project_id: TechnicalInputs(
                TechnicalData.from_rows(data.get(project_id, [])), queries.get(project_id)
            )
            for project_id in set(data) | set(queries)
        }


def _candidate(row, sheets, technical) -> Candidate:
    project_id, code, name, phase, paused, resumption, since = row[:7]
    deliverable_phase, content, complete, approved, scored = row[7:]
    deliverable = None
    if deliverable_phase is not None:
        deliverable = ExitDeliverable(deliverable_phase, content, complete, approved)
    sheet = None
    if phase == 1 and project_id in sheets:
        project, plan = sheets[project_id]
        sheet = SheetInputs(project, plan, None if deliverable is None else deliverable.content)
    inputs = None
    if phase == 2:
        inputs = technical.get(project_id) or TechnicalInputs(TechnicalData.from_rows([]), None)
    return Candidate(
        id=project_id,
        code=code,
        name=name,
        phase=phase,
        paused=paused,
        in_phase_since=since,
        expected_resumption=resumption,
        deliverable=deliverable,
        scored=scored,
        sheet=sheet,
        technical=inputs,
    )
