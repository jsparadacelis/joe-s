"""The use cases that share one transaction, handed to a route together."""

from __future__ import annotations

from dataclasses import dataclass

from backend.app.technical_data.application.edit_datum import EditDatum
from backend.app.technical_data.application.get_capacity import GetCapacity
from backend.app.technical_data.application.get_technical_data import GetTechnicalData
from backend.app.technical_data.application.restore_datum import RestoreDatum
from backend.app.technical_data.application.verify_all import VerifyAll
from backend.app.technical_data.application.verify_datum import VerifyDatum


@dataclass(frozen=True)
class TechnicalDataUseCases:
    get: GetTechnicalData
    capacity: GetCapacity
    edit: EditDatum
    restore: RestoreDatum
    verify: VerifyDatum
    verify_all: VerifyAll
