"""Everything a person can ask the platform to do. Only `READ` leaves the state untouched."""

from __future__ import annotations

from enum import Enum


class Action(str, Enum):
    PROMOTE = "promote"
    APPROVE_DELIVERABLE = "approve_deliverable"
    EDIT_DELIVERABLE = "edit_deliverable"
    PAUSE = "pause"
    RESUME = "resume"
    MANAGE_PROJECT_MEMBERS = "manage_project_members"
    MANAGE_STUDY_MEMBERS = "manage_study_members"
    EDIT_SETTINGS = "edit_settings"
    SCORE = "score"
    CREATE_OPPORTUNITY = "create_opportunity"
    READ = "read"
