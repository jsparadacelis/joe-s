"""Scoring use cases with simulated ports."""

from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import create_autospec

import pytest

from backend.app.audit.domain.event import Outcome
from backend.app.audit.domain.ports import AuditLog
from backend.app.opportunity.application.scoring import ScoringService, ScoringSettingsService
from backend.app.opportunity.domain.errors import (
    InvalidRatings,
    InvalidThreshold,
    InvalidWeights,
    NotAnOpportunity,
    ProjectNotFound,
    ScoringNotFound,
)
from backend.app.opportunity.domain.ports import ScoringRepository, ScoringSettingsRepository
from backend.app.opportunity.domain.scoring import (
    DEFAULT_WEIGHTS,
    Criterion,
    NewScoring,
    Recommendation,
    ScorableProject,
    Scoring,
    ScoringSettings,
)
from backend.app.study.domain.context import RequestContext, Role

CONTEXT = RequestContext(study_id="demo-study", user_id="demo-user", role=Role.PARTNER)
CODE = "PRY-2026-001"
KEYS = [c.value for c in Criterion]
WHEN = datetime(2026, 10, 24, 10, 0, tzinfo=timezone.utc)


def ratings(value=3, **overrides):
    data = {key: value for key in KEYS}
    data.update(overrides)
    return data


def weights(value=1, **overrides):
    data = {key: value for key in KEYS}
    data.update(overrides)
    return data


def a_project(phase=0):
    return ScorableProject(id="project-1", study_id="demo-study", code=CODE, current_phase=phase)


def a_scoring(version=1, score="60.0", recommendation=Recommendation.PURSUE):
    return Scoring(
        project_code=CODE,
        version=version,
        ratings={c: 3 for c in Criterion},
        weights=dict(DEFAULT_WEIGHTS),
        threshold=60,
        score=Decimal(score),
        recommendation=recommendation,
        scored_by="demo-user",
        scored_at=WHEN,
    )


@pytest.fixture
def audit_log():
    return create_autospec(AuditLog, spec_set=True, instance=True)


@pytest.fixture
def settings_repo():
    repo = create_autospec(ScoringSettingsRepository, spec_set=True, instance=True)
    repo.get.return_value = None
    return repo


@pytest.fixture
def scorings():
    repo = create_autospec(ScoringRepository, spec_set=True, instance=True)
    repo.get_project.return_value = a_project()
    repo.add.side_effect = lambda new: a_scoring(
        version=3, score=str(new.score), recommendation=new.recommendation
    )
    return repo


@pytest.fixture
def service(scorings, settings_repo, audit_log):
    return ScoringService(scorings, settings_repo, audit_log)


@pytest.fixture
def settings_service(settings_repo, audit_log):
    return ScoringSettingsService(settings_repo, audit_log)


class TestGetSettings:
    def test_without_stored_settings_returns_the_defaults(self, settings_service):
        settings = settings_service.get_settings()

        assert settings.weights == DEFAULT_WEIGHTS
        assert settings.threshold == 60

    def test_returns_the_stored_settings(self, settings_service, settings_repo):
        stored = ScoringSettings({c: Decimal(2) for c in Criterion}, 75)
        settings_repo.get.return_value = stored

        assert settings_service.get_settings() == stored


class TestUpdateSettings:
    def test_saves_the_validated_settings(self, settings_service, settings_repo):
        settings_service.update(CONTEXT, {"weights": weights(2, budget=0.5), "threshold": 70})

        (saved,) = settings_repo.save.call_args.args
        assert saved.threshold == 70
        assert saved.weights[Criterion.BUDGET] == Decimal("0.5")
        assert saved.weights[Criterion.LOCATION] == Decimal(2)

    def test_audits_old_and_new_values(self, settings_service, audit_log):
        settings_service.update(CONTEXT, {"weights": weights(2), "threshold": 70})

        (event,) = [call.args[0] for call in audit_log.record.call_args_list]
        assert (event.study_id, event.user_id) == ("demo-study", "demo-user")
        assert (event.entity, event.action, event.outcome) == (
            "scoring_settings",
            "update",
            Outcome.OK,
        )
        assert event.old_value["threshold"] == 60
        assert event.old_value["weights"]["budget"] == "1"
        assert event.new_value["threshold"] == 70
        assert event.new_value["weights"]["budget"] == "2"

    def test_invalid_weights_save_and_audit_nothing(
        self, settings_service, settings_repo, audit_log
    ):
        with pytest.raises(InvalidWeights):
            settings_service.update(CONTEXT, {"weights": weights(0), "threshold": 70})

        settings_repo.save.assert_not_called()
        audit_log.record.assert_not_called()

    def test_invalid_threshold_saves_and_audits_nothing(
        self, settings_service, settings_repo, audit_log
    ):
        with pytest.raises(InvalidThreshold):
            settings_service.update(CONTEXT, {"weights": weights(1), "threshold": 101})

        settings_repo.save.assert_not_called()
        audit_log.record.assert_not_called()


class TestScore:
    def test_all_threes_with_default_settings_is_60_and_pursue(self, service, scorings):
        service.score(CONTEXT, CODE, {"ratings": ratings(3)})

        (new,) = scorings.add.call_args.args
        assert isinstance(new, NewScoring)
        assert new.score == Decimal("60.0")
        assert new.recommendation is Recommendation.PURSUE
        assert new.threshold == 60
        assert new.weights == DEFAULT_WEIGHTS
        assert new.ratings == {c: 3 for c in Criterion}
        assert (new.project_id, new.project_code, new.study_id) == (
            "project-1",
            CODE,
            "demo-study",
        )
        assert new.scored_by == "demo-user"

    def test_uses_the_current_study_settings(self, service, scorings, settings_repo):
        settings_repo.get.return_value = ScoringSettings(
            {**DEFAULT_WEIGHTS, Criterion.CLIENT_FIT: Decimal(4)}, 80
        )

        service.score(CONTEXT, CODE, {"ratings": ratings(1, client_fit=5)})

        (new,) = scorings.add.call_args.args
        assert new.score == Decimal("52.0")
        assert new.threshold == 80
        assert new.recommendation is Recommendation.DO_NOT_PURSUE
        assert new.weights[Criterion.CLIENT_FIT] == Decimal(4)

    def test_returns_what_the_repository_stored(self, service):
        result = service.score(CONTEXT, CODE, {"ratings": ratings(3)})

        assert result.version == 3

    def test_locks_the_project_before_scoring(self, service, scorings):
        service.score(CONTEXT, CODE, {"ratings": ratings(3)})

        scorings.get_project.assert_called_once_with(CODE)

    def test_audits_the_save_with_version_and_snapshot(self, service, audit_log):
        service.score(CONTEXT, CODE, {"ratings": ratings(3)})

        (event,) = [call.args[0] for call in audit_log.record.call_args_list]
        assert (event.entity, event.entity_id, event.action, event.outcome) == (
            "opportunity_scoring",
            CODE,
            "score",
            Outcome.OK,
        )
        assert (event.study_id, event.user_id, event.version) == ("demo-study", "demo-user", 3)
        assert event.old_value is None
        assert event.new_value["score"] == "60.0"
        assert event.new_value["recommendation"] == "pursue"
        assert event.new_value["threshold"] == 60
        assert event.new_value["ratings"]["client_fit"] == 3
        assert event.new_value["weights"]["client_fit"] == "1"

    def test_never_touches_the_project_state(self, service, scorings):
        service.score(CONTEXT, CODE, {"ratings": ratings(3)})

        called = {name for name, *_ in scorings.method_calls}
        assert called <= {"get_project", "add", "latest", "history"}

    def test_unknown_project_is_not_found(self, service, scorings, audit_log):
        scorings.get_project.return_value = None

        with pytest.raises(ProjectNotFound):
            service.score(CONTEXT, CODE, {"ratings": ratings(3)})

        scorings.add.assert_not_called()
        audit_log.record.assert_not_called()

    @pytest.mark.parametrize("phase", [1, 2, 7])
    def test_a_project_past_phase_zero_is_not_an_opportunity(
        self, service, scorings, audit_log, phase
    ):
        scorings.get_project.return_value = a_project(phase)

        with pytest.raises(NotAnOpportunity):
            service.score(CONTEXT, CODE, {"ratings": ratings(3)})

        scorings.add.assert_not_called()
        audit_log.record.assert_not_called()

    def test_not_found_wins_over_everything_and_phase_wins_over_ratings(self, service, scorings):
        scorings.get_project.return_value = a_project(2)

        with pytest.raises(NotAnOpportunity):
            service.score(CONTEXT, CODE, {"ratings": ratings(9)})

        scorings.get_project.return_value = None
        with pytest.raises(ProjectNotFound):
            service.score(CONTEXT, CODE, {"ratings": ratings(9)})

    def test_invalid_ratings_store_and_audit_nothing(self, service, scorings, audit_log):
        with pytest.raises(InvalidRatings) as error:
            service.score(CONTEXT, CODE, {"ratings": ratings(3, timeline=6)})

        assert error.value.field == "timeline"
        scorings.add.assert_not_called()
        audit_log.record.assert_not_called()

    @pytest.mark.parametrize("body", [None, [], "x", {}, {"ratings": None}, {"ratings": [3] * 7}])
    def test_a_body_without_a_ratings_object_has_no_field(self, service, body):
        with pytest.raises(InvalidRatings) as error:
            service.score(CONTEXT, CODE, body)

        assert error.value.field is None


class TestRead:
    def test_returns_the_latest_and_the_history(self, service, scorings):
        scorings.latest.return_value = a_scoring(version=2)
        scorings.history.return_value = [a_scoring(version=2), a_scoring(version=1)]

        view = service.read(CODE)

        assert view.latest.version == 2
        assert [s.version for s in view.history] == [2, 1]
        scorings.get_project.assert_called_once_with(CODE, lock=False)
        scorings.latest.assert_called_once_with("project-1")
        scorings.history.assert_called_once_with("project-1")

    def test_unknown_project_is_not_found(self, service, scorings):
        scorings.get_project.return_value = None

        with pytest.raises(ProjectNotFound):
            service.read(CODE)

    def test_a_project_without_scoring_is_scoring_not_found(self, service, scorings):
        scorings.latest.return_value = None

        with pytest.raises(ScoringNotFound):
            service.read(CODE)
