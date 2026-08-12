"""Step 17 — deduplication tests. Uses the in-memory db_session fixture."""
from __future__ import annotations

from app.models.building import Building
from app.services.scraping.deduplicator import find_similar_buildings, match_building
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


# ─────────────────────── find_similar_buildings (the manual-form / bulk-import check) ───────────────────────


def test_find_similar_exact_reentry(db_session):
    """Re-entering the exact same address the team already captured."""
    db_session.add(
        Building(name="Eduard van Beinumstraat 4-36", address="Eduard van Beinumstraat 4-36", city="Amsterdam")
    )
    db_session.commit()
    results = find_similar_buildings(db_session, address="Eduard van Beinumstraat 4-36", city="Amsterdam")
    assert results and results[0].tier == "exact" and results[0].score == 1.0


def test_find_similar_near_miss_typo_and_abbreviation(db_session):
    """A near-miss: abbreviated street type, and a missing house-number
    range — should still surface as a match, not be silently missed."""
    db_session.add(Building(name="Existing", address="Arthur van Schendelstraat 500", city="Utrecht"))
    db_session.commit()
    results = find_similar_buildings(
        db_session, address="A. van Schendelstraat 500, Utrecht", city="Utrecht"
    )
    assert results and results[0].score >= 0.5


def test_find_similar_different_building_same_street_no_false_positive(db_session):
    """A genuinely different building on the same street (different house
    number) must NOT be flagged as a duplicate at the default threshold."""
    db_session.add(Building(name="Number 4", address="Keizersgracht 4", city="Amsterdam"))
    db_session.commit()
    results = find_similar_buildings(db_session, address="Keizersgracht 812", city="Amsterdam")
    assert results == []


def test_find_similar_excludes_self(db_session):
    """Editing a building must not flag itself as its own duplicate."""
    b = Building(name="Self", address="Damrak 1", city="Amsterdam")
    db_session.add(b)
    db_session.commit()
    results = find_similar_buildings(
        db_session, address="Damrak 1", city="Amsterdam", exclude_building_id=b.building_id
    )
    assert results == []


def test_find_similar_ranks_multiple_candidates(db_session):
    db_session.add_all(
        [
            Building(name="Exact", address="Herengracht 206-216", city="Amsterdam"),
            Building(name="Herengracht Offices", address="Unknown", city="Amsterdam"),
        ]
    )
    db_session.commit()
    results = find_similar_buildings(
        db_session, address="Herengracht 206-216", city="Amsterdam", name="Herengracht Offices"
    )
    assert len(results) >= 1
    assert results[0].tier == "exact"
