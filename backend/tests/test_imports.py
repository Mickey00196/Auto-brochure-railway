"""Workflow 2 (§4) import router tests. The network/browser call (`scrape`)
is monkeypatched out so these stay fast and deterministic — live scraping's
actual parsing logic is covered by tests/test_scraping.py's pure-function
tests against raw HTML instead.
"""
from __future__ import annotations

from app.routers import imports as imports_router
from app.services.scraping.base import ScrapedListing, ScrapedUnit


def _fake_listing_with_unit(url: str) -> ScrapedListing:
    return ScrapedListing(
        source_url=url,
        title="Test Building",
        address="Teststraat 1",
        city="Amsterdam",
        description="A test listing",
        photos=["https://example.test/photo.jpg"],
        units=[
            ScrapedUnit(
                floor=None, area_m2=250, min_divisible_area_m2=None,
                rent_raw="€200", service_charge_raw="€50", contract_term_raw="5 years",
            )
        ],
        amenities=["Roof Terrace"],
        energy_label="A",
        year_built=2020,
        parking_price_raw="€2,000",
    )


def _fake_listing_without_area(url: str) -> ScrapedListing:
    return ScrapedListing(
        source_url=url,
        title="No Area Building",
        address=None,
        city=None,
        description="",
        units=[
            ScrapedUnit(
                floor=None, area_m2=None, min_divisible_area_m2=None,
                rent_raw="tbd", service_charge_raw="tbd", contract_term_raw="tbd",
            )
        ],
    )


def test_import_creates_building_and_unit(client, monkeypatch):
    """Every field the scraper resolved should land in the same
    Building/Unit/AddOn schema a manual entry would use — not just area and
    rent, but service charge, contract term, amenities, year built, and
    parking, which earlier only round-tripped as far as the ScrapedListing
    dataclass and were silently dropped before reaching the database."""
    monkeypatch.setattr(imports_router, "scrape", _fake_listing_with_unit)
    r = client.post("/imports/urls", json={"urls": ["https://example.test/listing-1"]})
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["status"] == "created"
    assert body[0]["title"] == "Test Building"

    buildings = client.get("/buildings").json()
    match = next(b for b in buildings if b["building_id"] == body[0]["building_id"])
    assert match["address"] == "Teststraat 1"
    assert match["city"] == "Amsterdam"
    assert match["year_built"] == 2020
    assert match["building_amenities"] == ["Roof Terrace"]

    unit = match["units"][0]
    assert unit["available_area_m2"] == 250
    assert unit["rent_eur_per_m2_year"] == 200
    assert unit["rent_price_type"] == "fixed"
    assert unit["service_charge_eur_per_m2_year"] == 50
    assert unit["service_charge_price_type"] == "fixed"
    assert unit["contract_term"] == "5 years"

    addons = client.get(f"/addons?building_id={match['building_id']}").json()
    assert len(addons) == 1
    assert addons[0]["name"] == "Parking space"
    assert addons[0]["price"] == 2000


def test_import_without_area_creates_building_but_no_unit(client, monkeypatch):
    """§7/§24: an unresolved area must not be guessed (e.g. defaulted to 0) —
    skip the Unit and say so, rather than store a fabricated figure."""
    monkeypatch.setattr(imports_router, "scrape", _fake_listing_without_area)
    r = client.post("/imports/urls", json={"urls": ["https://example.test/listing-2"]})
    body = r.json()
    assert body[0]["status"] == "created"
    assert body[0]["message"] is not None

    buildings = client.get("/buildings").json()
    match = next(b for b in buildings if b["building_id"] == body[0]["building_id"])
    assert len(match["units"]) == 0


def test_import_reports_error_per_url_without_failing_batch(client, monkeypatch):
    def _raising_scrape(url: str) -> ScrapedListing:
        if "bad" in url:
            raise RuntimeError("network unreachable")
        return _fake_listing_with_unit(url)

    monkeypatch.setattr(imports_router, "scrape", _raising_scrape)
    r = client.post("/imports/urls", json={"urls": ["https://example.test/good", "https://example.test/bad-url"]})
    body = r.json()
    assert body[0]["status"] == "created"
    assert body[1]["status"] == "error"
    assert "network unreachable" in body[1]["message"]
