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
from app.services.scraping.deduplicator import DUPLICATE_MERGE_THRESHOLD, find_similar_buildings
from app.services.scraping.generic_scraper import scrape

router = APIRouter(prefix="/imports", tags=["imports"])

_NUMBER_RE = re.compile(r"[\d.,]+")

# Text that means the source served an anti-bot interstitial instead of the
# real listing. Detecting it lets us report a block honestly instead of
# storing the interstitial as a "building".
_BLOCK_MARKERS = (
    "je bent bijna op de pagina die je zoekt",
    "even geduld",
    "checking your browser",
    "verify you are human",
    "captcha",
)
_BLOCK_MESSAGE = (
    "Deze website blokkeert automatische toegang. Open de listing zelf in je browser, "
    "kopieer de tekst van de pagina, en gebruik 'Add Building' → 'plak de listing-tekst handmatig'."
)


def _looks_blocked(listing) -> bool:
    haystack = f"{getattr(listing, 'title', '') or ''} {getattr(listing, 'description', '') or ''}".lower()
    return any(marker in haystack for marker in _BLOCK_MARKERS)


class ImportUrlsRequest(BaseModel):
    urls: list[str]


class ImportResult(BaseModel):
    url: str
    status: str  # "created" | "updated" | "error" | "blocked"
    building_id: str | None = None
    title: str | None = None
    message: str | None = None


def _merge_scraped_into_existing(building: Building, listing) -> str:
    """A confident duplicate match (>= DUPLICATE_MERGE_THRESHOLD) updates the
    existing record instead of creating a second one — this is the actual
    fix for the "same address twice, once empty once filled in" pattern,
    since the unconditional-create below was never checking for one.

    Fill-blanks-only, never overwrite: a person may have already corrected
    something the scraper got wrong, and a re-scrape re-running that same
    scraper flaw should not silently stomp their fix. (Flagged rather than
    assumed per the brief — "last scraped wins" would be a one-line change
    to the conditions below if that's ever preferred instead.)"""
    filled: list[str] = []
    if not building.description and listing.description:
        building.description = listing.description
        filled.append("description")
    if not building.photos and listing.photos:
        building.photos = listing.photos
        filled.append("photos")
    elif listing.photos:
        # Still worth adding any genuinely new shots, even if some exist.
        new_photos = [p for p in listing.photos if p not in building.photos]
        if new_photos:
            building.photos = [*building.photos, *new_photos]
            filled.append(f"{len(new_photos)} new photo(s)")
    if not building.energy_label and listing.energy_label:
        building.energy_label = listing.energy_label
        filled.append("energy label")
    if not building.year_built and listing.year_built:
        building.year_built = listing.year_built
        filled.append("year built")
    if not building.source_url and listing.source_url:
        building.source_url = listing.source_url
    if listing.amenities:
        new_amenities = [a for a in listing.amenities if a not in building.building_amenities]
        if new_amenities:
            building.building_amenities = [*building.building_amenities, *new_amenities]
            filled.append("amenities")
    return f"Matched an existing building — filled in {', '.join(filled)}." if filled else (
        "Matched an existing building — nothing new to add, left it as-is."
    )


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
    if _looks_blocked(listing):
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, _BLOCK_MESSAGE)
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

        if _looks_blocked(listing):
            # Do NOT store the interstitial as a building — report the block.
            results.append(ImportResult(url=url, status="blocked", message=_BLOCK_MESSAGE))
            continue

        # This loop is the actual unconditional-create path that produced
        # the "same address twice, once empty once filled in" duplicates —
        # every prior call here created a Building with no check at all.
        # A confident match updates that existing record instead.
        candidates = find_similar_buildings(
            db, address=listing.address, city=listing.city, name=listing.title,
        )
        existing = candidates[0].building if candidates and candidates[0].score >= DUPLICATE_MERGE_THRESHOLD else None

        status = "created"
        message = None
        if existing:
            building = existing
            message = _merge_scraped_into_existing(building, listing)
            status = "updated"
        else:
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

        if listing.parking_price_raw and listing.parking_price_raw != "tbd" and not existing:
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

        # Matched an existing building that already has space(s) recorded —
        # adding another Unit from this scrape would just be a second,
        # possibly-conflicting figure for the same space. Only a genuine
        # draft (no units yet) gets this scrape's units, same as a fresh
        # create would.
        if not existing or len(building.units) == 0:
            for scraped_unit in listing.units:
                if scraped_unit.area_m2 is None:
                    if not existing:
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
            ImportResult(url=url, status=status, building_id=building.building_id, title=listing.title, message=message)
        )

    return results
