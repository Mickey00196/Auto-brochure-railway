"""§7 Scraping Engine — pure-function tests (no network dependency)."""
from __future__ import annotations

from app.services.scraping.generic_scraper import (
    extract_amenities,
    extract_contract_term,
    extract_price_near_keyword,
    extract_price_raw,
    extract_units_from_text,
    extract_year_built,
    guess_address_from_title,
    parse_area_subdivision,
    parse_html,
)


def test_preserves_subdivision_instead_of_collapsing():
    """§7: "581 m², units from 150 m²" must not collapse to one figure."""
    total, min_divisible = parse_area_subdivision("581 m², units from 150 m²")
    assert total == 581
    assert min_divisible == 150


def test_parses_parenthesized_subdivision():
    total, min_divisible = parse_area_subdivision("307 m² (from 75 m²)")
    assert total == 307
    assert min_divisible == 75


def test_simple_area_has_no_subdivision():
    total, min_divisible = parse_area_subdivision("431 m²")
    assert total == 431
    assert min_divisible is None


def test_price_raw_fixed():
    assert extract_price_raw("Rent: €243 per m² per year") == "€243"


def test_price_raw_from_range():
    assert extract_price_raw("Rent: from €245 per m²") == "from €245"


def test_price_raw_missing_becomes_tbd_not_blank():
    """§7/§24: unmapped fields must be explicitly 'tbd', never blank or guessed."""
    assert extract_price_raw("Rent: TBD") == "tbd"
    assert extract_price_raw("No pricing information on this page") == "tbd"


def test_extract_units_from_multi_floor_building():
    """§1 row 1: Moermanskkade 600 has separately available units on the 1st,
    2nd and 4th floor — each floor block should yield its own ScrapedUnit."""
    blocks = [
        "1st floor — 620 m², from €240 per m², service charge €58",
        "2nd floor — 410 m², price TBD",
        "4th floor — 307 m² (from 75 m²), price TBD",
    ]
    units = extract_units_from_text(blocks)
    assert len(units) == 3
    assert units[0].floor == "1st floor"
    assert units[2].min_divisible_area_m2 == 75


_SAMPLE_HTML = """
<html>
<head>
  <meta charset="utf-8">
  <title>Keizersgracht 100, Amsterdam - Office for lease</title>
  <meta name="description" content="A premium canal-side office, energy label A.">
</head>
<body>
  <img src="/photos/exterior.jpg">
  <img src="/icons/logo.png">
  <p>Total area 320 m², units from 120 m². Rent from €260 per m² per year.
  Service charge €55 per m² per year. Contract term: 5 years, negotiable.
  Parking €2,200 per space per year. Energy label A. Built in 2015.
  Amenities include a roof terrace and bicycle storage.</p>
</body>
</html>
"""


def test_parse_html_extracts_title_description_photos():
    listing = parse_html(_SAMPLE_HTML, "https://example-brokerage.test/listings/100")
    assert listing.title == "Keizersgracht 100, Amsterdam - Office for lease"
    assert "premium canal-side office" in listing.description.lower()
    assert listing.photos == ["https://example-brokerage.test/photos/exterior.jpg"]  # logo.png filtered out
    assert listing.energy_label == "A"


def test_parse_html_preserves_subdivision_and_rent():
    """Same fix as §7's core requirement, now exercised end-to-end from raw
    HTML rather than a pre-split floor block."""
    listing = parse_html(_SAMPLE_HTML, "https://example-brokerage.test/listings/100")
    assert len(listing.units) == 1
    unit = listing.units[0]
    assert unit.area_m2 == 320
    assert unit.min_divisible_area_m2 == 120
    assert unit.rent_raw == "from €260"


def test_parse_html_missing_area_stays_none_not_zero():
    listing = parse_html("<html><title>No pricing info</title><body>Nothing here.</body></html>", "https://x.test")
    assert listing.units[0].area_m2 is None
    assert listing.units[0].rent_raw == "tbd"


def test_parse_html_populates_full_schema_not_a_thinner_one():
    """The scraped listing should fill in the same fields a manual entry
    would — service charge, contract term, amenities, year built, parking,
    and a best-effort address/city — not just area and rent."""
    listing = parse_html(_SAMPLE_HTML, "https://example-brokerage.test/listings/100")
    assert listing.address == "Keizersgracht 100"
    assert listing.city == "Amsterdam"
    assert listing.year_built == 2015
    assert listing.parking_price_raw == "€2,200"
    assert set(listing.amenities) >= {"Roof Terrace", "Bicycle Storage"}

    unit = listing.units[0]
    assert unit.service_charge_raw == "€55"
    assert unit.contract_term_raw == "5 years, negotiable"


def test_guess_address_from_title_requires_a_number():
    """A wrong address is worse than an honest TBD — refuse to guess when
    the first segment doesn't look like a street address (§7, §24)."""
    assert guess_address_from_title("Keizersgracht 100, Amsterdam - Office for lease") == ("Keizersgracht 100", "Amsterdam")
    assert guess_address_from_title("Premium Offices For Lease In Amsterdam") == (None, None)
    assert guess_address_from_title("No comma here") == (None, None)


def test_extract_price_near_keyword_ignores_unrelated_prices():
    text = "Parking €2,200 per space. Rent €260 per m². Service charge €55 per m²."
    assert extract_price_near_keyword(text, "rent") == "€260"
    assert extract_price_near_keyword(text, "service charge") == "€55"
    assert extract_price_near_keyword(text, "parking") == "€2,200"
    assert extract_price_near_keyword(text, "deposit") == "tbd"


def test_extract_year_built():
    assert extract_year_built("This building was built in 1998.") == 1998
    assert extract_year_built("Year of construction: 2021.") == 2021
    assert extract_year_built("No date mentioned.") is None


def test_extract_contract_term_tbd_when_absent():
    assert extract_contract_term("Contract term: 5 years, negotiable.") == "5 years, negotiable"
    assert extract_contract_term("Nothing about lease length here.") == "tbd"


def test_extract_amenities_matches_known_vocabulary_only():
    amenities = extract_amenities("Featuring a roof terrace, bicycle storage, and a totally made-up feature.")
    assert set(amenities) == {"Roof Terrace", "Bicycle Storage"}


def test_extract_amenities_uses_word_boundaries_not_substring_match():
    """Regression test: "spa" is a real amenity phrase but is also a
    substring of "space" — raw `phrase in text` containment falsely matched
    "per spa[c]e per year" as a spa amenity."""
    amenities = extract_amenities("Parking is available: €2,200 per space per year.")
    assert "Spa" not in amenities
