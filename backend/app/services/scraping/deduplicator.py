"""Match a normalized listing to the building it advertises — without
creating a duplicate building every time the same asset is scraped, and
without silently merging two properties on a weak signal.

Two distinct questions (Step 9's building-vs-listing split):
  * listing identity — "have we seen this exact ad before?" — is answered in
    the upsert by (source, source_listing_id|source_url); not here.
  * building identity — "which underlying building is this?" — is answered
    here, using progressively weaker identifiers (Step 8). High-confidence
    matches attach automatically; a low-confidence match is flagged for review
    instead of merged.
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models.building import Building
from app.services.scraping.normalized import NormalizedListing
from app.services.scraping.normalizer import canonical_address_key


@dataclass
class BuildingMatch:
    building: Building | None
    confidence: str  # "exact" | "high" | "medium" | "low" | "none"
    needs_review: bool


def _norm(s: str | None) -> str:
    return (s or "").strip().lower()


def match_building(session: Session, listing: NormalizedListing) -> BuildingMatch:
    """Find the existing Building this listing belongs to, or report none.

    Confidence tiers, strongest first:
      exact  — normalized street+house+city key matches
      high   — postcode + house number match
      low    — same city + very similar building name (flagged, NOT auto-merged)
    Anything weaker returns none, so a new building is created rather than
    guessed onto the wrong asset.
    """
    listing_key = canonical_address_key(listing.street, listing.house_number, listing.city)

    # Pull candidate buildings once. The dataset here is a single team's
    # inventory, not millions of rows, so an in-Python comparison over all
    # buildings is fine and keeps the matching logic readable/testable.
    buildings = session.query(Building).all()

    # Tier 1 — exact normalized address key.
    if listing_key:
        for b in buildings:
            b_street, b_house = _split_building_address(b)
            if canonical_address_key(b_street, b_house, b.city) == listing_key:
                return BuildingMatch(b, "exact", needs_review=False)

    # Tier 2 — postcode + house number.
    if listing.postal_code and listing.house_number:
        lp = _norm(listing.postal_code).replace(" ", "")
        lh = _norm(listing.house_number).replace(" ", "").replace("-", "")
        for b in buildings:
            _, b_house = _split_building_address(b)
            if (
                b.postal_code
                and _norm(b.postal_code).replace(" ", "") == lp
                and b_house
                and _norm(b_house).replace(" ", "").replace("-", "") == lh
            ):
                return BuildingMatch(b, "high", needs_review=False)

    # Tier 3 — same city + closely matching building name. Deliberately weak:
    # flagged for a human, never auto-merged (Step 8).
    if listing.building_name and listing.city:
        ln = _norm(listing.building_name)
        for b in buildings:
            if _norm(b.city) == _norm(listing.city) and b.name and _name_similar(ln, _norm(b.name)):
                return BuildingMatch(b, "low", needs_review=True)

    return BuildingMatch(None, "none", needs_review=False)


def _split_building_address(b: Building) -> tuple[str | None, str | None]:
    """Existing Building rows store a single `address` string. Best-effort
    split into (street, house_number) for comparison, reusing the same address
    parser adapters feed through so both sides normalize identically."""
    from app.services.scraping.normalizer import parse_dutch_address

    parts = parse_dutch_address(b.address)
    return parts["street"], parts["house_number"]


def _name_similar(a: str, b: str) -> bool:
    """Cheap similarity: one name contains the other, or they share a long
    token. Intentionally conservative — this tier only *flags*, never merges."""
    if not a or not b:
        return False
    if a in b or b in a:
        return True
    a_tokens = {t for t in a.split() if len(t) >= 5}
    b_tokens = {t for t in b.split() if len(t) >= 5}
    return bool(a_tokens & b_tokens)
