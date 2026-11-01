"""What the Catastro tells us about a property.

Deliberately has no ownership data (name, tax id, holder): the platform neither needs nor
may store it. Only the fields below ever leave the adapter that reads the service.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any


class PropertyClass(str, Enum):
    URBAN = "urban"
    RUSTIC = "rustic"


@dataclass(frozen=True)
class BuildingUnit:
    """A constructive unit: its use, the floor and the built area."""

    use: str
    floor: str | None
    area_m2: int | None


@dataclass(frozen=True)
class CadastralProperty:
    reference: str
    address: str
    municipality: str
    province: str
    property_class: PropertyClass | None
    use: str | None
    construction_year: int | None
    built_area_m2: int | None
    plot_area_m2: int | None
    units: tuple[BuildingUnit, ...]
    latitude: float | None  # WGS84 (EPSG:4326)
    longitude: float | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "reference": self.reference,
            "address": self.address,
            "municipality": self.municipality,
            "province": self.province,
            "property_class": self.property_class.value if self.property_class else None,
            "use": self.use,
            "construction_year": self.construction_year,
            "built_area_m2": self.built_area_m2,
            "plot_area_m2": self.plot_area_m2,
            "units": [{"use": u.use, "floor": u.floor, "area_m2": u.area_m2} for u in self.units],
            "latitude": self.latitude,
            "longitude": self.longitude,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> CadastralProperty:
        """Read only the known keys: anything else in `data` is dropped."""
        property_class = data["property_class"]
        return cls(
            reference=data["reference"],
            address=data["address"],
            municipality=data["municipality"],
            province=data["province"],
            property_class=PropertyClass(property_class) if property_class else None,
            use=data["use"],
            construction_year=data["construction_year"],
            built_area_m2=data["built_area_m2"],
            plot_area_m2=data["plot_area_m2"],
            units=tuple(
                BuildingUnit(use=u["use"], floor=u["floor"], area_m2=u["area_m2"])
                for u in data["units"]
            ),
            latitude=data["latitude"],
            longitude=data["longitude"],
        )
