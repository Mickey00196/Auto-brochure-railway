"""§7 Scraping Engine — generic implementation.

`fetch_rendered_html` drives the pre-installed Playwright Chromium to render
a listing page (handles JS-heavy brokerage sites); it requires outbound
network access to the target site, which this sandbox does not have for
arbitrary third-party domains, so it's provided but not exercised by tests.

`parse_area_subdivision` and `extract_units_from_text` are pure functions
with no network dependency — they're the actual fix for §7's core
requirement (preserve subdivision instead of collapsing to one figure) and
are covered by tests/test_scraping.py against text patterns modeled on the
reference brochure.
"""
from __future__ import annotations

import re
from urllib.parse import urljoin

from app.services.scraping.base import ScrapedListing, ScrapedUnit

# Matches patterns like "581 m², units from 150 m²" or "307 m² (from 75 m²)"
_SUBDIVISION_RE = re.compile(
    r"(?P<total>[\d.,]+)\s*m²[,\s(]*"
    r"(?:units?\s+)?from\s*(?P<min>[\d.,]+)\s*m²",
    re.IGNORECASE,
)

_SIMPLE_AREA_RE = re.compile(r"(?P<total>[\d.,]+)\s*m²")


def _to_float(raw: str) -> float:
    return float(raw.replace(".", "").replace(",", ".")) if "," in raw else float(raw.replace(",", ""))


def parse_area_subdivision(text: str) -> tuple[float | None, float | None]:
    """Returns (total_area_m2, min_divisible_area_m2). Preserves subdivision
    instead of collapsing a building to a single area figure (§7)."""
    match = _SUBDIVISION_RE.search(text)
    if match:
        return _to_float(match.group("total")), _to_float(match.group("min"))

    simple = _SIMPLE_AREA_RE.search(text)
    if simple:
        return _to_float(simple.group("total")), None

    return None, None


_PRICE_RE = re.compile(r"€\s*(?P<value>[\d.,]+)")
_FROM_RE = re.compile(r"\bfrom\b", re.IGNORECASE)
_TBD_RE = re.compile(r"\b(tbd|on request|price on application|in overleg)\b", re.IGNORECASE)


def extract_price_raw(text: str) -> str:
    """Returns a raw price token: a euro amount, 'from €X', or 'tbd' — never
    blank, never a guess (§7, §24)."""
    if _TBD_RE.search(text):
        return "tbd"
    match = _PRICE_RE.search(text)
    if not match:
        return "tbd"
    prefix = "from " if _FROM_RE.search(text) else ""
    return f"{prefix}€{match.group('value')}"


def extract_price_near_keyword(text: str, keyword: str, window: int = 80) -> str:
    """Same contract as extract_price_raw, but anchored to the text right
    after `keyword` (e.g. "rent", "service charge", "parking") instead of
    grabbing the first euro amount anywhere on the page — a page can easily
    have several prices, and picking the wrong one silently is worse than
    just returning 'tbd' (§7, §24). Falls back to 'tbd' if the keyword isn't
    found at all; callers that want a page-wide fallback do that themselves.
    """
    match = re.search(re.escape(keyword), text, re.IGNORECASE)
    if not match:
        return "tbd"
    return extract_price_raw(text[match.start() : match.start() + window])


def extract_units_from_text(floor_blocks: list[str]) -> list[ScrapedUnit]:
    """`floor_blocks` is one text chunk per floor/unit section of a listing
    page (however the source site groups the DOM). Each block is parsed
    independently so a multi-floor building (e.g. units on the 1st, 2nd and
    4th floor) yields one ScrapedUnit per floor rather than one flattened
    Building record (§1 row 1, §7)."""
    units: list[ScrapedUnit] = []
    floor_re = re.compile(r"(ground floor|\d+(?:st|nd|rd|th) floor)", re.IGNORECASE)
    for block in floor_blocks:
        floor_match = floor_re.search(block)
        total_area, min_area = parse_area_subdivision(block)
        units.append(
            ScrapedUnit(
                floor=floor_match.group(1) if floor_match else None,
                area_m2=total_area,
                min_divisible_area_m2=min_area,
                rent_raw=extract_price_raw(block),
                service_charge_raw=extract_price_near_keyword(block, "service charge"),
                contract_term_raw=extract_contract_term(block),
            )
        )
    return units


def fetch_rendered_html(url: str, *, timeout_ms: int = 15_000) -> str:
    """Render `url` with the pre-installed headless Chromium. Requires
    outbound network access to the target domain — not called by the test
    suite, which exercises the pure-parsing functions above instead."""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
        try:
            page = browser.new_page()
            page.goto(url, timeout=timeout_ms, wait_until="networkidle")
            return page.content()
        finally:
            browser.close()


_ENERGY_LABEL_RE = re.compile(r"energy label\s*[:\-]?\s*([A-G]\+*)", re.IGNORECASE)
_YEAR_BUILT_RE = re.compile(r"(?:built in|year of construction|constructed in)\D{0,10}(\d{4})", re.IGNORECASE)
_CONTRACT_TERM_RE = re.compile(r"contract term\s*[:\-]?\s*([^.\n]{3,60})", re.IGNORECASE)
_SKIP_IMAGE_KEYWORDS = ("logo", "icon", "sprite", "avatar", "pixel")

# Fixed vocabulary matched against page text — a real per-source implementation
# would read a structured amenities list from the DOM; this is the same kind
# of coarse, keyword-based fallback as the rest of this module, and still
# beats not extracting amenities at all.
_AMENITY_PHRASES = [
    "roof terrace", "rooftop terrace", "bicycle storage", "24/7 access",
    "on-site concierge", "restaurant", "gym", "spa", "auditorium", "bar",
    "shared lounge", "high-speed fibre", "furnished", "meeting room",
    "air conditioning", "raised floors",
]


def extract_amenities(text: str) -> list[str]:
    """Word-boundary matching, not raw substring containment — "spa" is a
    real amenity phrase but is also a substring of "per spa[c]e per year",
    and a false-positive amenity is worse than an incomplete list."""
    lowered = text.lower()
    return [
        phrase.title()
        for phrase in _AMENITY_PHRASES
        if re.search(rf"\b{re.escape(phrase)}\b", lowered)
    ]


def extract_year_built(text: str) -> int | None:
    match = _YEAR_BUILT_RE.search(text)
    return int(match.group(1)) if match else None


def extract_contract_term(text: str) -> str:
    """Returns raw contract-term text, or 'tbd' — never guessed (§24)."""
    match = _CONTRACT_TERM_RE.search(text)
    return match.group(1).strip() if match else "tbd"


def guess_address_from_title(title: str) -> tuple[str | None, str | None]:
    """Best-effort (address, city) guess from a title formatted like
    "Keizersgracht 100, Amsterdam - Office for lease" — a common listing-page
    convention, not a guarantee. Returns (None, None) rather than a guess if
    the first segment doesn't contain a number (i.e. doesn't look like a
    street address) — a wrong address is worse than an honest TBD (§7, §24).
    """
    segments = [s.strip() for s in re.split(r"[,\-–]", title) if s.strip()]
    if len(segments) < 2:
        return None, None
    address_candidate, city_candidate = segments[0], segments[1]
    if not re.search(r"\d", address_candidate):
        return None, None
    return address_candidate, city_candidate


def parse_html(html: str, url: str) -> ScrapedListing:
    """Pure parsing over already-fetched HTML — no network dependency, so
    this half is directly testable (tests/test_scraping.py). Extracts what's
    genuinely extractable without site-specific selectors: title, meta
    description, images, address (best-effort, from the title), amenities,
    year built, and a keyword-anchored reading of rent/service
    charge/contract term/parking. This is deliberately coarse — a real
    per-source implementation would target specific DOM sections per unit
    (§7) — but it populates the same Building/Unit schema a manually-entered
    listing does, field for field, rather than a thinner one; whatever this
    can't resolve is still 'tbd'/omitted, never a blank or a guess (§24).

    Neighbourhood is deliberately NOT inferred here: §5.4's single-source-of-
    truth design means transit/amenity facts for an area belong on one
    shared Neighbourhood record, and guessing which existing Neighbourhood a
    scraped address belongs to (without geocoding) risks silently attaching
    it to the wrong one — worse than leaving it unassigned for a human to
    confirm.
    """
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "html.parser")

    title_tag = soup.find("meta", property="og:title") or soup.find("title")
    title = (title_tag.get("content") if title_tag and title_tag.get("content") else title_tag.get_text(strip=True)) if title_tag else ""

    desc_tag = soup.find("meta", attrs={"name": "description"}) or soup.find("meta", property="og:description")
    description = desc_tag.get("content", "").strip() if desc_tag else ""

    photos: list[str] = []
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src")
        if not src or any(k in src.lower() for k in _SKIP_IMAGE_KEYWORDS):
            continue
        photos.append(urljoin(url, src))
        if len(photos) >= 8:
            break

    visible_text = soup.get_text(separator=" ", strip=True)
    total_area, min_area = parse_area_subdivision(visible_text)
    rent_raw = extract_price_near_keyword(visible_text, "rent")
    if rent_raw == "tbd":
        rent_raw = extract_price_raw(visible_text)  # page-wide fallback if "rent" isn't literally on the page
    service_charge_raw = extract_price_near_keyword(visible_text, "service charge")
    parking_price_raw = extract_price_near_keyword(visible_text, "parking")
    energy_match = _ENERGY_LABEL_RE.search(visible_text)
    address, city = guess_address_from_title(title)

    units = [
        ScrapedUnit(
            floor=None,
            area_m2=total_area,
            min_divisible_area_m2=min_area,
            rent_raw=rent_raw,
            service_charge_raw=service_charge_raw,
            contract_term_raw=extract_contract_term(visible_text),
        )
    ]

    return ScrapedListing(
        source_url=url,
        title=title,
        address=address,
        city=city,
        description=description,
        photos=photos,
        units=units,
        amenities=extract_amenities(visible_text),
        energy_label=energy_match.group(1).upper() if energy_match else None,
        year_built=extract_year_built(visible_text),
        parking_price_raw=parking_price_raw,
    )


def scrape(url: str) -> ScrapedListing:
    """End-to-end scrape: fetch (network-dependent, see fetch_rendered_html)
    + parse (pure, see parse_html). Downstream AI normalization (§8) and the
    QA pass (§8) should run on the returned ScrapedListing before it becomes
    stored Building/Unit records.
    """
    html = fetch_rendered_html(url)
    return parse_html(html, url)
