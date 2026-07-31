"""Step 17 — parsing/normalization tests. Pure functions, no DB/network."""
from __future__ import annotations

import pytest

from app.services.scraping import normalizer as N


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("1.250 m²", 1250.0),
        ("1,250 m2", 1250.0),
        ("1250 m²", 1250.0),
        ("307 m² (from 75 m²)", 307.0),
        ("geen oppervlakte", None),
    ],
)
def test_parse_area(raw, expected):
    assert N.parse_area(raw) == expected


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("1.250", 1250.0),      # nl thousands
        ("1.250,50", 1250.5),   # nl thousands + decimal
        ("1,250.50", 1250.5),   # en thousands + decimal
        ("295,00", 295.0),      # nl decimal
        ("1250", 1250.0),
        ("29.5", 29.5),         # bare decimal
    ],
)
def test_parse_number(raw, expected):
    assert N.parse_number(raw) == expected


def test_parse_price_full():
    assert N.parse_price("€ 295,00 per m² per jaar") == (295.0, "m2", "year")


def test_parse_price_per_desk_month():
    assert N.parse_price("€ 450 per werkplek per maand") == (450.0, "desk", "month")


def test_parse_price_amount_only():
    amount, unit, period = N.parse_price("€ 1.250")
    assert amount == 1250.0 and unit is None and period is None


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("500 tot 5.000 m²", (500.0, 5000.0)),
        ("vanaf 500 m²", (500.0, None)),
        ("1.250 m²", (1250.0, 1250.0)),
    ],
)
def test_parse_area_range(raw, expected):
    assert N.parse_area_range(raw) == expected


@pytest.mark.parametrize(
    "raw,expected",
    [("Energielabel A+++", "A+++"), ("energy label C", "C"), ("no label", None)],
)
def test_parse_energy_label(raw, expected):
    assert N.parse_energy_label(raw) == expected


def test_parse_dutch_address_full():
    parsed = N.parse_dutch_address("Wibautstraat 131-D, 1091 GL Amsterdam")
    assert parsed["street"] == "Wibautstraat"
    assert parsed["house_number"] == "131-D"
    assert parsed["postal_code"] == "1091 GL"
    assert parsed["city"] == "Amsterdam"


def test_parse_dutch_address_missing_fields_are_none():
    parsed = N.parse_dutch_address("Somewhere vague")
    assert parsed["postal_code"] is None
    assert parsed["house_number"] is None


@pytest.mark.parametrize(
    "a_house,b_house",
    [("131-D", "131 D"), ("131D", "131-D"), ("131 D", "131D")],
)
def test_canonical_address_key_collapses_house_number_formatting(a_house, b_house):
    a = N.canonical_address_key("Wibautstraat", a_house, "Amsterdam")
    b = N.canonical_address_key("Wibautstraat", b_house, "Amsterdam")
    assert a == b and a is not None


def test_canonical_address_key_distinguishes_different_numbers():
    a = N.canonical_address_key("Wibautstraat", "131", "Amsterdam")
    b = N.canonical_address_key("Wibautstraat", "133", "Amsterdam")
    assert a != b
