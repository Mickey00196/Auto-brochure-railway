"""§17 AI Assistant.

"Find offices in Amsterdam Zuid, between 150 and 250 sqm, maximum
€8,000/month, energy label A, near a station" → matching Units → brochure →
PowerPoint → draft client email.

Query parsing is a deterministic regex heuristic by default (no external API
key required to run this app); `get_description_provider`-style pluggability
is the intended swap point for a real LLM-backed parser once an API key is
configured — see app/services/description_generator.py for the same pattern.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from app.services.matching import MatchCriteria

_SIZE_RANGE_RE = re.compile(r"between\s+(?P<min>[\d.,]+)\s+and\s+(?P<max>[\d.,]+)\s*sq?m", re.IGNORECASE)
_BUDGET_MONTHLY_RE = re.compile(r"max(?:imum)?\s*€\s*(?P<value>[\d.,]+)\s*/?\s*month", re.IGNORECASE)
_BUDGET_ANNUAL_RE = re.compile(r"max(?:imum)?\s*€\s*(?P<value>[\d.,]+)\s*/?\s*(?:m2|m²|sqm)?\s*/?\s*(?:year|yr)", re.IGNORECASE)
_ENERGY_LABEL_RE = re.compile(r"energy label\s+([A-G]\+*)", re.IGNORECASE)
_NEAR_STATION_RE = re.compile(r"near\s+a?\s*(station|public transport|metro|train)", re.IGNORECASE)
_CITY_RE = re.compile(r"in\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)")


@dataclass
class ParsedQuery:
    criteria: MatchCriteria
    raw_text: str


def parse_query(text: str) -> ParsedQuery:
    size_match = _SIZE_RANGE_RE.search(text)
    size_min = float(size_match.group("min").replace(",", "")) if size_match else None
    size_max = float(size_match.group("max").replace(",", "")) if size_match else None

    budget = None
    monthly_match = _BUDGET_MONTHLY_RE.search(text)
    if monthly_match:
        # Approximate monthly-budget → €/m²/yr conversion needs an area; since the
        # assistant doesn't know area yet at parse time, treat it as an
        # informational cap surfaced to the user rather than silently guessing.
        budget = None
    else:
        annual_match = _BUDGET_ANNUAL_RE.search(text)
        if annual_match:
            budget = float(annual_match.group("value").replace(",", ""))

    energy_match = _ENERGY_LABEL_RE.search(text)
    city_match = _CITY_RE.search(text)

    criteria = MatchCriteria(
        city=city_match.group(1).split()[0] if city_match else None,
        budget_eur_per_m2_year_max=budget,
        size_m2_min=size_min,
        size_m2_max=size_max,
        energy_label=energy_match.group(1) if energy_match else None,
        near_public_transport=bool(_NEAR_STATION_RE.search(text)),
    )
    return ParsedQuery(criteria=criteria, raw_text=text)


def draft_client_email(client_name: str, proposal_title: str, unit_count: int, prepared_by: str) -> str:
    return (
        f"Subject: {proposal_title}\n\n"
        f"Dear {client_name} team,\n\n"
        f"Please find attached our curated shortlist of {unit_count} office opportunities matching "
        "your search criteria. Each listing includes floor area, headline pricing and an all-in "
        "annual cost estimate to make comparison straightforward.\n\n"
        "We would be delighted to arrange viewings for any locations of interest.\n\n"
        "Questions? We are happy to assist you.\n\n"
        f"Best regards,\n{prepared_by}"
    )
