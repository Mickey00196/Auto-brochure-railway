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

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AddOn, Building, Unit
from app.models.enums import RentPriceType, ServiceChargePriceType
from app.schemas import ScrapePreviewRequest, ScrapePreviewResult
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


@router.post("/preview", response_model=ScrapePreviewResult)
def preview_url(payload: ScrapePreviewRequest) -> ScrapePreviewResult:
    """Scrape a listing URL and return Building-shaped fields for the manual
    Add Building form to autofill — nothing is written to the database here;
    the user still submits the (possibly-edited) form via POST /buildings."""
    try:
        listing = scrape(payload.url.strip())
    except Exception as e:  # network failure, timeout, missing Chromium, etc.
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Could not fetch that URL: {e}")
    return ScrapePreviewResult(
        name=listing.title or None,
        address=listing.address,
        city=listing.city,
        description=listing.description or None,
        photos=listing.photos,
        energy_label=listing.energy_label,
        year_built=listing.year_built,
        building_amenities=listing.amenities,
        source_url=listing.source_url,
    )


class ParseTextRequest(BaseModel):
    content: str


@router.post("/parse-text", response_model=ScrapePreviewResult)
def parse_pasted_text(payload: ParseTextRequest) -> ScrapePreviewResult:
    """Manual fallback (compliant): the user opens a listing page in their own
    browser, copies the page text or HTML, and pastes it here. We parse the
    same fields out of *their* pasted content — no automated fetch of the
    source at all, so a site that blocks bots is irrelevant to this path.

    Accepts either raw HTML (reuses the same JSON-LD/OG/heuristic parser the
    adapters use) or plain page text (normalizer heuristics only). Nothing is
    persisted; it returns Building-shaped fields for the Add Building form to
    autofill, exactly like /preview does for a URL."""
    from app.services.scraping import normalizer as N
    from app.services.scraping.sources.html_parse import _AMENITY_PHRASES, parse_listing_html

    content = (payload.content or "").strip()
    if not content:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Paste the listing's text or HTML first.")

    if "<" in content and ">" in content:
        # Looks like HTML — run it through the shared parser.
        listing = parse_listing_html(content, url="", source="pasted")
        if listing is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Could not parse the pasted HTML.")
        return ScrapePreviewResult(
            name=listing.building_name or listing.title,
            address=listing.address,
            city=listing.city,
            description=listing.description,
            photos=listing.image_urls,
            energy_label=listing.energy_label,
            year_built=listing.construction_year,
            building_amenities=listing.amenities,
            source_url="",
        )

    # Plain text: normalizer heuristics over the pasted content.
    first_line = next((ln.strip() for ln in content.splitlines() if ln.strip()), None)
    addr = N.parse_dutch_address(content[:400])
    address = None
    if addr["street"]:
        address = ", ".join(
            p for p in [
                " ".join(x for x in [addr["street"], addr["house_number"]] if x),
                " ".join(x for x in [addr["postal_code"], addr["city"]] if x),
            ] if p.strip()
        )
    lowered = content.lower()
    amenities = sorted({p.title() for p in _AMENITY_PHRASES if p in lowered})
    return ScrapePreviewResult(
        name=first_line,
        address=address,
        city=addr["city"],
        description=content if len(content) < 2000 else content[:2000],
        photos=[],
        energy_label=N.parse_energy_label(content),
        year_built=N.parse_year(content),
        building_amenities=amenities,
        source_url="",
    )


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
