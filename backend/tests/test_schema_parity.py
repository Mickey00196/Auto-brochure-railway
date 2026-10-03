"""Regression test for the exact defect the spec warned about: a manually
entered Building and a scraped one must land in the identical schema — not
diverge into two structures that brochures/comparisons can't treat uniformly.

This doesn't just eyeball the two routers' source code (already true today
— both write `Building`/`Unit` ORM instances directly, no separate scraped
table exists) — it proves it at the API boundary: create one of each, fetch
both back, and assert the response has the exact same field set. If a
future change ever adds a Building/Unit field that only one path populates,
this test breaks immediately rather than silently drifting.
"""
from __future__ import annotations

from app.routers import imports as imports_router
from app.services.scraping.base import ScrapedListing, ScrapedUnit


def _rich_scraped_listing(url: str) -> ScrapedListing:
    """A listing exercising every field the scraper can resolve — the same
    fields a thorough manual entry would fill in."""
    return ScrapedListing(
        source_url=url,
        title="Scraped Building",
        address="Scrapelaan 1",
        city="Amsterdam",
        description="A scraped listing",
        photos=["https://example.test/photo.jpg"],
        units=[
            ScrapedUnit(
                floor="2nd floor", area_m2=300, min_divisible_area_m2=100,
                rent_raw="€250", service_charge_raw="€60", contract_term_raw="5 years",
            )
        ],
        amenities=["Roof Terrace"],
        energy_label="A",
        year_built=2018,
        parking_price_raw="€2,000",
    )


def _create_manual_building(client) -> str:
    building = client.post(
        "/buildings",
        json={
            "name": "Manual Building",
            "address": "Handstraat 1",
            "city": "Amsterdam",
            "building_type": "Turn-key Office",
            "year_built": 2018,
            "energy_label": "A",
            "building_amenities": ["Roof Terrace"],
            "photos": ["https://example.test/photo.jpg"],
        },
    ).json()
    client.post(
        "/units",
        json={
            "building_id": building["building_id"],
            "floor": "2nd floor",
            "available_area_m2": 300,
            "min_divisible_area_m2": 100,
            "rent_price_type": "fixed",
            "rent_eur_per_m2_year": 250,
            "service_charge_price_type": "fixed",
            "service_charge_eur_per_m2_year": 60,
            "contract_term": "5 years",
        },
    )
    return building["building_id"]


def _create_scraped_building(client, monkeypatch) -> str:
    monkeypatch.setattr(imports_router, "scrape", _rich_scraped_listing)
    result = client.post("/imports/urls", json={"urls": ["https://example.test/listing"]}).json()
    return result[0]["building_id"]


def test_manual_and_scraped_buildings_share_identical_field_set(client, monkeypatch):
    manual_id = _create_manual_building(client)
    scraped_id = _create_scraped_building(client, monkeypatch)

    manual = client.get(f"/buildings/{manual_id}").json()
    scraped = client.get(f"/buildings/{scraped_id}").json()

    assert set(manual.keys()) == set(scraped.keys()), (
        "Manual and scraped buildings must expose the exact same schema — "
        f"manual-only keys: {set(manual.keys()) - set(scraped.keys())}, "
        f"scraped-only keys: {set(scraped.keys()) - set(manual.keys())}"
    )

    manual_unit = manual["units"][0]
    scraped_unit = scraped["units"][0]
    assert set(manual_unit.keys()) == set(scraped_unit.keys()), (
        "Manual and scraped units must expose the exact same schema — "
        f"manual-only keys: {set(manual_unit.keys()) - set(scraped_unit.keys())}, "
        f"scraped-only keys: {set(scraped_unit.keys()) - set(manual_unit.keys())}"
    )


def test_manual_and_scraped_buildings_populate_the_same_values_for_the_same_facts(client, monkeypatch):
    """Not just the same shape — a scraped listing that resolved a fact
    (year built, amenities, service charge, contract term) should store it
    the same way a manual entry would, not leave it thinner by default."""
    manual_id = _create_manual_building(client)
    scraped_id = _create_scraped_building(client, monkeypatch)

    manual = client.get(f"/buildings/{manual_id}").json()
    scraped = client.get(f"/buildings/{scraped_id}").json()

    for field in ("year_built", "energy_label", "building_amenities"):
        assert manual[field] == scraped[field], f"{field} diverged: manual={manual[field]!r} scraped={scraped[field]!r}"

    manual_unit = manual["units"][0]
    scraped_unit = scraped["units"][0]
    for field in (
        "available_area_m2", "min_divisible_area_m2", "rent_price_type", "rent_eur_per_m2_year",
        "service_charge_price_type", "service_charge_eur_per_m2_year", "contract_term",
    ):
        assert manual_unit[field] == scraped_unit[field], (
            f"{field} diverged: manual={manual_unit[field]!r} scraped={scraped_unit[field]!r}"
        )
