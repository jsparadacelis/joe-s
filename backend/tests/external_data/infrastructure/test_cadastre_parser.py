"""The XML parser: recorded responses in, the white-listed fields out."""

import json

import pytest

from backend.app.external_data.domain.cadastral_property import BuildingUnit, PropertyClass
from backend.app.external_data.domain.errors import CadastreNotFound, CadastreUnavailable
from backend.app.external_data.infrastructure.cadastre_parser import (
    parse_coordinates,
    parse_property,
)
from backend.tests.external_data.domain.test_cadastral_property import REFERENCE
from backend.tests.external_data.infrastructure.recorded import fixture, with_holder_fields


class TestProperty:
    def test_reads_the_whitelisted_fields_of_the_recorded_response(self):
        result = parse_property(REFERENCE, fixture("dnprc_ok.xml"))

        assert result.reference == REFERENCE
        assert result.address == "CL EJEMPLO 1 00000 MUNICIPIO DE EJEMPLO (PROVINCIA DE EJEMPLO)"
        assert result.municipality == "MUNICIPIO DE EJEMPLO"
        assert result.province == "PROVINCIA DE EJEMPLO"
        assert result.property_class is PropertyClass.URBAN
        assert result.use == "Residencial"
        assert result.construction_year == 1980
        assert result.built_area_m2 == 308
        assert result.plot_area_m2 is None
        assert result.units == (
            BuildingUnit(use="VIVIENDA", floor="00", area_m2=109),
            BuildingUnit(use="ALMACEN", floor="00", area_m2=187),
            BuildingUnit(use="OTROS USOS", floor="00", area_m2=12),
        )
        assert result.latitude is None and result.longitude is None

    def test_a_rustic_class_and_a_plot_area_are_read(self):
        xml = (
            fixture("dnprc_ok.xml")
            .decode()
            .replace("<cn>UR</cn>", "<cn>RU</cn>")
            .replace("</lcons>", "</lcons><lspr><spr><dspr><ssp>250</ssp></dspr></spr></lspr>")
        )

        result = parse_property(REFERENCE, xml.encode())

        assert result.property_class is PropertyClass.RUSTIC
        assert result.plot_area_m2 == 250

    def test_optional_fields_may_be_missing(self):
        xml = (
            fixture("dnprc_ok.xml")
            .decode()
            .replace("<ant>1980</ant>", "")
            .replace("<sfc>308</sfc>", "")
            .replace("<luso>Residencial</luso>", "")
            .replace("<cn>UR</cn>", "<cn>XX</cn>")
        )

        result = parse_property(REFERENCE, xml.encode())

        assert result.construction_year is None
        assert result.built_area_m2 is None
        assert result.use is None
        assert result.property_class is None

    def test_a_response_without_units_gives_an_empty_tuple(self):
        xml = fixture("dnprc_ok.xml").decode()
        xml = xml[: xml.index("<lcons>")] + xml[xml.index("</lcons>") + len("</lcons>") :]

        assert parse_property(REFERENCE, xml.encode()).units == ()

    def test_holder_fields_never_reach_the_model(self):
        result = parse_property(REFERENCE, with_holder_fields(fixture("dnprc_ok.xml")))

        dumped = json.dumps(result.to_dict())
        assert "HOLDER" not in dumped
        assert "00000000T" not in dumped
        assert result == parse_property(REFERENCE, fixture("dnprc_ok.xml"))

    @pytest.mark.parametrize("name", ["dnprc_malformed.xml"])
    def test_not_found_or_malformed_reference_errors_are_not_found(self, name):
        with pytest.raises(CadastreNotFound):
            parse_property(REFERENCE, fixture(name))

    def test_other_service_errors_are_unavailable(self):
        with pytest.raises(CadastreUnavailable):
            parse_property(REFERENCE, fixture("dnprc_service_error.xml"))

    @pytest.mark.parametrize(
        "body",
        [
            b"",
            b"not xml at all",
            b"<html><body>Service temporarily down</body></html>",
            b'<?xml version="1.0"?><consulta_dnp><control/></consulta_dnp>',
        ],
    )
    def test_an_unexpected_body_is_unavailable(self, body):
        with pytest.raises(CadastreUnavailable):
            parse_property(REFERENCE, body)

    def test_a_response_without_address_is_unavailable(self):
        xml = fixture("dnprc_ok.xml").decode()
        xml = xml.replace("<ldt>", "<other>").replace("</ldt>", "</other>")

        with pytest.raises(CadastreUnavailable):
            parse_property(REFERENCE, xml.encode())

    def test_entity_expansion_and_external_entities_are_rejected(self):
        bomb = (
            b'<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;&a;">]>'
            b"<consulta_dnp>&b;</consulta_dnp>"
        )
        xxe = (
            b'<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]>'
            b"<consulta_dnp>&e;</consulta_dnp>"
        )

        for body in (bomb, xxe):
            with pytest.raises(CadastreUnavailable):
                parse_property(REFERENCE, body)


class TestCoordinates:
    def test_reads_longitude_and_latitude(self):
        assert parse_coordinates(fixture("cpmrc_ok.xml")) == (38.5, -3.5)

    def test_a_missing_reference_is_unavailable_because_the_property_was_found(self):
        with pytest.raises(CadastreUnavailable):
            parse_coordinates(fixture("cpmrc_not_found.xml"))

    @pytest.mark.parametrize("body", [b"", b"<x/>", b"{}"])
    def test_an_unexpected_body_is_unavailable(self, body):
        with pytest.raises(CadastreUnavailable):
            parse_coordinates(body)

    def test_non_numeric_coordinates_are_unavailable(self):
        xml = fixture("cpmrc_ok.xml").decode().replace("-3.5", "abc")

        with pytest.raises(CadastreUnavailable):
            parse_coordinates(xml.encode())
