"""Workflow 2 (§4): paste one or more listing URLs → scrape → normalize →
store as Building/Unit records available to any future Proposal, with no
manual re-typing required.

Writes to the exact same Building/Unit/AddOn models the manual-entry
routers (buildings.py, units.py, addons.py) use — there is no separate
"scraped listing" structure. What differs from a manually-entered listing
isn't the schema, it's how much of it a given import fills in: extraction is
deliberately coarse (see generic_scraper.parse_html) since real per-source
DOM selectors aren't developed against real sites in this environment.
Every field that couldn't be determined is stored as "tbd"/omitted rather
than blank or guessed (§7, §24), and each URL's result is reported
independently so one bad URL doesn't fail the whole batch.
"""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AddOn, Building, Unit
from app.models.enums import RentPriceType, ServiceChargePriceType
from app.services.scraping.generic_scraper import scrape

router = APIRouter(prefix="/imports", tags=["imports"])

_NUMBER_RE = re.compile(r"[\d.,]+")


class ImportUrlsRequest(BaseModel):
    urls: list[str]


class ImportResult(BaseModel):
    url: str
    status: str  # "created" | "error"
    building_id: str | None = None
    title: str | None = None
    message: str | None = None


def _parse_amount(raw: str) -> float | None:
    match = _NUMBER_RE.search(raw)
    return float(match.group().replace(",", "")) if match else None


def _parse_rent(raw: str) -> tuple[RentPriceType, float | None]:
    if raw == "tbd":
        return RentPriceType.TBD, None
    price_type = RentPriceType.FROM if raw.startswith("from") else RentPriceType.FIXED
    return price_type, _parse_amount(raw)


def _parse_service_charge(raw: str) -> tuple[ServiceChargePriceType, float | None]:
    # ServiceChargePriceType has no "from" variant (matches the original gap
    # table — service charge is fixed or TBD, never a range) — a "from €X"
    # reading still yields a real fixed figure to store, not a rejection.
    if raw == "tbd":
        return ServiceChargePriceType.TBD, None
    value = _parse_amount(raw)
    return (ServiceChargePriceType.FIXED, value) if value is not None else (ServiceChargePriceType.TBD, None)


@router.post("/urls", response_model=list[ImportResult])
def import_urls(payload: ImportUrlsRequest, db: Session = Depends(get_db)):
    results: list[ImportResult] = []

    for url in payload.urls:
        url = url.strip()
        if not url:
            continue
        try:
            listing = scrape(url)
        except Exception as e:  # network failure, timeout, missing Chromium, etc.
            results.append(ImportResult(url=url, status="error", message=str(e)))
            continue

        building = Building(
            name=listing.title or url,
            address=listing.address or "TBD",
            city=listing.city or "TBD",
            description=listing.description or None,
            photos=listing.photos,
            source_url=listing.source_url,
            energy_label=listing.energy_label,
            year_built=listing.year_built,
            building_amenities=listing.amenities,
        )
        db.add(building)
        db.flush()

        if listing.parking_price_raw and listing.parking_price_raw != "tbd":
            parking_price = _parse_amount(listing.parking_price_raw)
            if parking_price is not None:
                db.add(
                    AddOn(
                        building_id=building.building_id,
                        name="Parking space",
                        price=parking_price,
                        price_unit="EUR / space / year",
                    )
                )

        message = None
        for scraped_unit in listing.units:
            if scraped_unit.area_m2 is None:
                message = "Area could not be determined from the page — building created without a unit; add one manually."
                continue
            rent_type, rent_value = _parse_rent(scraped_unit.rent_raw)
            service_charge_type, service_charge_value = _parse_service_charge(scraped_unit.service_charge_raw)
            db.add(
                Unit(
                    building_id=building.building_id,
                    floor=scraped_unit.floor,
                    available_area_m2=scraped_unit.area_m2,
                    min_divisible_area_m2=scraped_unit.min_divisible_area_m2,
                    rent_price_type=rent_type,
                    rent_eur_per_m2_year=rent_value,
                    service_charge_price_type=service_charge_type,
                    service_charge_eur_per_m2_year=service_charge_value,
                    contract_term=None if scraped_unit.contract_term_raw == "tbd" else scraped_unit.contract_term_raw,
                )
            )

        db.commit()
        results.append(
            ImportResult(url=url, status="created", building_id=building.building_id, title=listing.title, message=message)
        )

    return results
