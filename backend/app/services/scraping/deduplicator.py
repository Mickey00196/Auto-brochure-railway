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
from app.services.scraping.normalizer import canonical_address_key, parse_dutch_address

# Numeric scores for the two tiers surfaced to a human (the manual form's
# inline warning, and the bulk-import merge decision) — kept as named
# constants rather than inlined so the "where's the actual number" question
# from the brief has one answer, tunable in one place once there's real
# false-positive/negative data to calibrate against. Deliberately not the
# pg_trgm/GIN-index approach the brief sketched: match_building() below
# already existed (Step 8/9's building-vs-listing matcher) with the exact
# same job — a tiered, tested (tests/test_normalizer.py, test_scraping.py),
# dependency-free matcher that works identically on the SQLite this app runs
# on locally and the Postgres it runs on in production. Standing up pg_trgm
# would only be justified once this simpler approach's precision is proven
# to fall short in practice.
DUPLICATE_SUGGEST_THRESHOLD = 0.5   # manual-form inline warning: soft, non-blocking
DUPLICATE_MERGE_THRESHOLD = 0.85    # bulk import: confident enough to update instead of create


@dataclass
class BuildingMatch:
    building: Building | None
    confidence: str  # "exact" | "high" | "medium" | "low" | "none"
    needs_review: bool


@dataclass
class DuplicateCandidate:
    building: Building
    tier: str  # "exact" | "postcode_house" | "name"
    score: float


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


def find_similar_buildings(
    session: Session,
    *,
    address: str | None,
    city: str | None,
    postal_code: str | None = None,
    name: str | None = None,
    exclude_building_id: str | None = None,
    limit: int = 3,
) -> list[DuplicateCandidate]:
    """Rank existing buildings by how likely they are to be the *same*
    building as the one described by these fields — the multi-candidate,
    scored counterpart to match_building() above. Used both for the manual
    Add Building form's live "this looks similar to..." warning and the bulk
    importer's create-vs-update decision.

    Same three tiers as match_building, each returned rather than
    short-circuited on the first hit, since a human (or the importer) may
    want to see more than one candidate."""
    parsed = parse_dutch_address(address)
    street, house_number = parsed["street"], parsed["house_number"]
    key = canonical_address_key(street, house_number, city or parsed["city"])

    candidates: list[DuplicateCandidate] = []
    seen_ids: set[str] = set()

    def add(building: Building, tier: str, score: float) -> None:
        if building.building_id in seen_ids or building.building_id == exclude_building_id:
            return
        seen_ids.add(building.building_id)
        candidates.append(DuplicateCandidate(building=building, tier=tier, score=score))

    buildings = session.query(Building).all()

    # Tier 1 — exact normalized address key.
    if key:
        for b in buildings:
            b_street, b_house = _split_building_address(b)
            if canonical_address_key(b_street, b_house, b.city) == key:
                add(b, "exact", 1.0)

    # Tier 2 — postcode + house number.
    pc = postal_code or parsed["postal_code"]
    if pc and house_number:
        lp = _norm(pc).replace(" ", "")
        lh = _norm(house_number).replace(" ", "").replace("-", "")
        for b in buildings:
            _, b_house = _split_building_address(b)
            if (
                b.postal_code
                and _norm(b.postal_code).replace(" ", "") == lp
                and b_house
                and _norm(b_house).replace(" ", "").replace("-", "") == lh
            ):
                add(b, "postcode_house", 0.9)

    # Tier 3 — same city + similar building *name*. Street-name similarity
    # alone is deliberately NOT a signal here even when no name was given:
    # two different buildings routinely share a street ("Keizersgracht 4"
    # vs "Keizersgracht 812" are not the same building), so a fuzzy street
    # match only counts alongside a matching house number below — that's
    # what actually distinguishes "near-miss spelling of the same address"
    # ("Arthur van Schendelstraat 500" vs "A. van Schendelstraat 500") from
    # "a different building on the same street".
    city_val = city or parsed["city"]
    if name and city_val:
        probe_name = _norm(name)
        for b in buildings:
            if _norm(b.city) == _norm(city_val) and b.name and _name_similar(probe_name, _norm(b.name)):
                add(b, "name", 0.6)

    if street and house_number and city_val:
        lh = _norm(house_number).replace(" ", "").replace("-", "")
        for b in buildings:
            b_street, b_house = _split_building_address(b)
            if (
                _norm(b.city) == _norm(city_val)
                and b_house
                and _norm(b_house).replace(" ", "").replace("-", "") == lh
                and _name_similar(_norm(street), _norm(b_street or ""))
            ):
                add(b, "name", 0.55)

    candidates.sort(key=lambda c: c.score, reverse=True)
    return candidates[:limit]


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
