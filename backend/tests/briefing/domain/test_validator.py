"""Validator of the phase 2 exit deliverable (RGB-32): the generic promotion route can never
leave the Briefing with a content that the brief promotion would have refused.

Names fixed here: backend.app.briefing.domain.validator.BriefDeliverableValidator
(.validate(content) -> list of Spanish labels), reading content["brief"] and
content["technical_data"]["data"] (a list of {"id", "value", ...}).
"""

from backend.app.briefing.domain.validator import BriefDeliverableValidator

BRIEF = {
    "needs": "Needs (sample)",
    "program": "Program (sample)",
    "constraints": "Constraints (sample)",
    "target_budget": 1000,
    "deadline": "2027-06-30",
    "client_approval": "meeting",
}
DATA = {"data": [{"id": "address", "value": "Street (sample)"}, {"id": "year", "value": ""}]}


def test_a_complete_content_has_nothing_missing():
    assert BriefDeliverableValidator().validate({"brief": BRIEF, "technical_data": DATA}) == []


def test_an_empty_content_misses_everything():
    assert BriefDeliverableValidator().validate({}) == [
        "Necesidades",
        "Programa",
        "Condicionantes",
        "Presupuesto objetivo",
        "Plazo",
        "Datos técnicos obtenidos",
        "Aprobación del cliente registrada",
    ]


def test_pending_approval_is_missing():
    content = {"brief": {**BRIEF, "client_approval": "pending"}, "technical_data": DATA}

    assert BriefDeliverableValidator().validate(content) == ["Aprobación del cliente registrada"]


def test_a_photo_without_values_is_not_obtained():
    content = {"brief": BRIEF, "technical_data": {"data": [{"id": "year", "value": ""}]}}

    assert BriefDeliverableValidator().validate(content) == ["Datos técnicos obtenidos"]


def test_unverified_data_do_not_block():
    data = {"data": [{"id": "address", "value": "x", "verified": False}]}

    assert BriefDeliverableValidator().validate({"brief": BRIEF, "technical_data": data}) == []
