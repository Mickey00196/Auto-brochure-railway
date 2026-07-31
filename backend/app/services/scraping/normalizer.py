"""Pure normalization helpers — text as sources write it → consistent numbers.

No network, no DB: every function here is deterministic and unit-tested
(tests/test_normalizer.py). The hard cases are Dutch conventions: "1.250 m²"
means 1250 (dot = thousands), "€ 295,00" means 295.00 (comma = decimal), and
area can arrive as a single figure or a "from X to Y" range.

Anything unparseable returns None rather than a guess (spec Step 5: never
fabricate a missing value).
"""
from __future__ import annotations

import re

# "1.250,50" (nl) → 1250.50 ; "1,250.50" (en) → 1250.50 ; "1250" → 1250.
# We decide which separator is the decimal one by which appears last.
_NUM_RE = re.compile(r"\d[\d.,]*\d|\d")


def parse_number(raw: str | None) -> float | None:
    """Parse a single number written in either Dutch or English grouping.

    "1.250"    -> 1250.0     (dot = thousands sep, nl)
    "1.250,50" -> 1250.5     (dot thousands, comma decimal, nl)
    "1,250.50" -> 1250.5     (comma thousands, dot decimal, en)
    "1250"     -> 1250.0
    "295,00"   -> 295.0
    """
    if not raw:
        return None
    m = _NUM_RE.search(raw)
    if not m:
        return None
    token = m.group()
    if "," in token and "." in token:
        # Whichever comes last is the decimal separator; the other is grouping.
        decimal_sep = "," if token.rfind(",") > token.rfind(".") else "."
        thousands_sep = "." if decimal_sep == "," else ","
        token = token.replace(thousands_sep, "").replace(decimal_sep, ".")
    elif "," in token:
        # Comma alone: decimal if it looks like "…,dd" (1-2 trailing digits),
        # otherwise a thousands separator ("1,250" -> 1250).
        after = token.split(",")[-1]
        token = token.replace(",", "." if len(after) <= 2 else "")
    elif "." in token:
        # Dot alone: thousands separator if it groups 3 digits ("1.250" ->
        # 1250), decimal otherwise ("29.5" -> 29.5).
        after = token.split(".")[-1]
        if len(after) == 3 and token.count(".") >= 1 and len(token.replace(".", "")) > 3:
            token = token.replace(".", "")
    try:
        return float(token)
    except ValueError:
        return None


def parse_int(raw: str | None) -> int | None:
    value = parse_number(raw)
    return int(value) if value is not None else None


_AREA_TOKEN = r"[\d.,]+\s*m(?:2|²)"
_AREA_RANGE_RE = re.compile(
    r"(?P<min>[\d.,]+)\s*(?:m(?:2|²))?\s*(?:tot|to|-|–|—)\s*(?P<max>[\d.,]+)\s*m(?:2|²)",
    re.IGNORECASE,
)
_AREA_FROM_RE = re.compile(
    r"(?:vanaf|from)\s*(?P<min>[\d.,]+)\s*m(?:2|²)", re.IGNORECASE
)
_AREA_SINGLE_RE = re.compile(r"(?P<val>[\d.,]+)\s*m(?:2|²)", re.IGNORECASE)


def parse_area(raw: str | None) -> float | None:
    """A single area figure in m². "1.250 m²" / "1,250 m2" / "1250 m²" -> 1250."""
    if not raw:
        return None
    m = _AREA_SINGLE_RE.search(raw)
    return parse_number(m.group("val")) if m else None


def parse_area_range(raw: str | None) -> tuple[float | None, float | None]:
    """Returns (min, max) m². Handles "500 tot 5.000 m²", "vanaf 500 m²"
    (min only), and a bare "1.250 m²" (both = the single figure)."""
    if not raw:
        return None, None
    rng = _AREA_RANGE_RE.search(raw)
    if rng:
        return parse_number(rng.group("min")), parse_number(rng.group("max"))
    frm = _AREA_FROM_RE.search(raw)
    if frm:
        return parse_number(frm.group("min")), None
    single = parse_area(raw)
    return single, single


# "€ 295,00 per m² per jaar" and friends. Captures the amount plus, best-effort,
# the per-unit and per-period so the normalized listing keeps them explicit
# instead of assuming everything is €/m²/year.
_PRICE_RE = re.compile(
    r"€\s*(?P<amount>[\d.,]+)"
    r"(?:\s*(?:per|/)\s*(?P<unit>m(?:2|²)|desk|werkplek|unit))?"
    r"(?:\s*(?:per|/)\s*(?P<period>jaar|maand|year|month|yr|mo))?",
    re.IGNORECASE,
)

_UNIT_CANON = {"m2": "m2", "m²": "m2", "desk": "desk", "werkplek": "desk", "unit": "unit"}
_PERIOD_CANON = {
    "jaar": "year", "year": "year", "yr": "year",
    "maand": "month", "month": "month", "mo": "month",
}


def parse_price(raw: str | None) -> tuple[float | None, str | None, str | None]:
    """Returns (amount, unit, period). "€ 295,00 per m² per jaar" ->
    (295.0, "m2", "year"). Unit/period are None when the text doesn't state
    them — not defaulted."""
    if not raw:
        return None, None, None
    m = _PRICE_RE.search(raw)
    if not m:
        # A bare number with no € sign — still return the amount if present.
        return parse_number(raw), None, None
    amount = parse_number(m.group("amount"))
    unit_raw = (m.group("unit") or "").lower()
    period_raw = (m.group("period") or "").lower()
    unit = _UNIT_CANON.get(unit_raw)
    period = _PERIOD_CANON.get(period_raw)
    return amount, unit, period


# A standalone A–G with optional trailing pluses. The lookahead stops it from
# matching a letter embedded in a word ("E" in "ENERGIELABEL") or a code like
# "A4", while still allowing "A+++".
_ENERGY_RE = re.compile(r"\b([A-G])(\+*)(?![A-Za-z0-9])")


def parse_energy_label(raw: str | None) -> str | None:
    """"Energielabel A+++" -> "A+++". Only A–G (with optional pluses)."""
    if not raw:
        return None
    m = _ENERGY_RE.search(raw.upper())
    return (m.group(1) + m.group(2)) if m else None


_YEAR_RE = re.compile(r"\b(1[89]\d{2}|20\d{2})\b")


def parse_year(raw: str | None) -> int | None:
    if not raw:
        return None
    m = _YEAR_RE.search(raw)
    return int(m.group(1)) if m else None


# A Dutch address: "Wibautstraat 131-D, 1091 GL Amsterdam". Street can contain
# spaces; house number is digits plus an optional suffix; postcode is "1234 AB".
_POSTCODE_RE = re.compile(r"\b(\d{4})\s?([A-Z]{2})\b", re.IGNORECASE)
_STREET_HOUSE_RE = re.compile(
    r"(?P<street>[A-Za-zÀ-ÿ.\-'\s]+?)\s+(?P<number>\d+[\s\-]?[A-Za-z]?)\b"
)


def parse_dutch_address(raw: str | None) -> dict[str, str | None]:
    """Best-effort split into {street, house_number, postal_code, city}. Any
    part it can't isolate is None — a wrong split is worse than an honest gap."""
    result: dict[str, str | None] = {
        "street": None, "house_number": None, "postal_code": None, "city": None,
    }
    if not raw:
        return result
    text = raw.strip()

    pc = _POSTCODE_RE.search(text)
    if pc:
        result["postal_code"] = f"{pc.group(1)} {pc.group(2).upper()}"
        # City is whatever follows the postcode.
        tail = text[pc.end():].strip(" ,-")
        if tail:
            result["city"] = tail.split(",")[0].strip()
        head = text[: pc.start()].strip(" ,-")
    else:
        # No postcode: assume "Street 12, City" shape.
        parts = [p.strip() for p in text.split(",") if p.strip()]
        head = parts[0] if parts else text
        if len(parts) > 1:
            result["city"] = parts[-1]

    sh = _STREET_HOUSE_RE.search(head)
    if sh:
        result["street"] = sh.group("street").strip()
        result["house_number"] = re.sub(r"\s+", "", sh.group("number")).upper()
    elif head:
        result["street"] = head
    return result


def canonical_address_key(
    street: str | None, house_number: str | None, city: str | None
) -> str | None:
    """A comparable key for dedup: lowercased, punctuation/space-stripped
    "wibautstraat131damsterdam". "131-D", "131 D" and "131D" collapse to the
    same key; two genuinely different house numbers do not."""
    if not (street and house_number):
        return None
    parts = [street, house_number, city or ""]
    joined = "".join(parts).lower()
    return re.sub(r"[^a-z0-9]", "", joined)
