"""§7 Scraping Engine — shared contract.

A scraper's job is to turn a listing URL into a `ScrapedListing`, which
preserves unit-level subdivision (§7: "581 m², units from 150 m²" must not
collapse into one figure — this pattern appeared in 3 of the 7 reference
listings) and marks anything it couldn't find as `"tbd"` rather than
leaving it blank or guessing (§7, §24).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class ScrapedUnit:
    floor: str | None
    area_m2: float | None
    min_divisible_area_m2: float | None
    rent_raw: str  # "tbd" if not found — never blank, never guessed
    service_charge_raw: str
    contract_term_raw: str


@dataclass
class ScrapedListing:
    source_url: str
    title: str
    address: str | None
    city: str | None
    description: str
    photos: list[str] = field(default_factory=list)
    floorplans: list[str] = field(default_factory=list)
    brochure_urls: list[str] = field(default_factory=list)
    units: list[ScrapedUnit] = field(default_factory=list)
    amenities: list[str] = field(default_factory=list)
    energy_label: str | None = None
    year_built: int | None = None
    broker_name: str | None = None
    broker_email: str | None = None
    transit_notes: list[str] = field(default_factory=list)
    # Building-level parking, mirroring AddOn(building_id=..., name="Parking space")
    # — kept as a raw string like unit prices ("tbd" if not found, never guessed).
    parking_price_raw: str | None = None


class Scraper(Protocol):
    def scrape(self, url: str) -> ScrapedListing: ...
