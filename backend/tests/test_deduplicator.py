"""Step 17 — deduplication tests. Uses the in-memory db_session fixture."""
from __future__ import annotations

from app.models.building import Building
from app.services.scraping.deduplicator import match_building
from app.services.scraping.normalized import NormalizedListing


def _listing(**kw) -> NormalizedListing:
    base = dict(source="funda", source_url="http://x")
    base.update(kw)
    return NormalizedListing(**base)


def test_exact_address_match(db_session):
    db_session.add(Building(name="Office A", address="Wibautstraat 131, 1091 GL Amsterdam", city="Amsterdam"))
    db_session.commit()
    m = match_building(db_session, _listing(street="Wibautstraat", house_number="131", city="Amsterdam"))
    assert m.confidence == "exact" and m.building is not None and not m.needs_review


def test_house_number_formatting_still_matches(db_session):
    db_session.add(Building(name="Office A", address="Wibautstraat 131-D, 1091 GL Amsterdam", city="Amsterdam"))
    db_session.commit()
    m = match_building(db_session, _listing(street="Wibautstraat", house_number="131 D", city="Amsterdam"))
    assert m.confidence == "exact"


def test_postcode_house_number_match(db_session):
    db_session.add(Building(name="B", address="Some street 5", postal_code="1091 GL", city="Amsterdam"))
    db_session.commit()
    m = match_building(
        db_session,
        _listing(street="Other name", house_number="5", postal_code="1091 GL", city="Amsterdam"),
    )
    assert m.confidence in ("exact", "high") and m.building is not None


def test_different_house_number_does_not_match(db_session):
    db_session.add(Building(name="A", address="Wibautstraat 131, 1091 GL Amsterdam", city="Amsterdam"))
    db_session.commit()
    m = match_building(db_session, _listing(street="Wibautstraat", house_number="133", city="Amsterdam"))
    assert m.building is None and m.confidence == "none"


def test_low_confidence_name_match_is_flagged_not_merged(db_session):
    db_session.add(Building(name="Symphony Offices", address="Unknown", city="Amsterdam"))
    db_session.commit()
    m = match_building(
        db_session,
        _listing(building_name="Symphony Offices tower", city="Amsterdam"),
    )
    assert m.confidence == "low" and m.needs_review is True


def test_no_match_when_no_data(db_session):
    m = match_building(db_session, _listing())
    assert m.building is None and m.confidence == "none"
