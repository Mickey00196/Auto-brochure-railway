"""§12 Property Matching.

Scores Units (not just Buildings — two units in the same building can differ
completely on floor, price and condition, §5.2) against a search brief:
location, budget, size, amenities, lease type.
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models import Building, Unit


@dataclass
class MatchCriteria:
    city: str | None = None
    budget_eur_per_m2_year_max: float | None = None
    size_m2_min: float | None = None
    size_m2_max: float | None = None
    required_amenities: list[str] | None = None
    energy_label: str | None = None
    near_public_transport: bool = False


@dataclass
class MatchResult:
    unit: Unit
    score: float
    reasons: list[str]


def score_unit(unit: Unit, building: Building, criteria: MatchCriteria) -> MatchResult:
    score = 0.0
    max_score = 0.0
    reasons: list[str] = []

    if criteria.city:
        max_score += 1
        if building.city.lower() == criteria.city.lower():
            score += 1
            reasons.append(f"Located in {building.city}")

    if criteria.size_m2_min is not None or criteria.size_m2_max is not None:
        max_score += 1
        lower = criteria.size_m2_min if criteria.size_m2_min is not None else 0
        upper = criteria.size_m2_max if criteria.size_m2_max is not None else float("inf")
        divisible = unit.min_divisible_area_m2 or unit.available_area_m2
        if lower <= unit.available_area_m2 <= upper or (divisible <= upper and unit.available_area_m2 >= lower):
            score += 1
            reasons.append(f"{unit.available_area_m2:,.0f} m² fits the requested size range")

    if criteria.budget_eur_per_m2_year_max is not None:
        max_score += 1
        all_in = None
        if unit.rent_eur_per_m2_year is not None and unit.service_charge_eur_per_m2_year is not None:
            all_in = unit.rent_eur_per_m2_year + unit.service_charge_eur_per_m2_year
        if all_in is not None and all_in <= criteria.budget_eur_per_m2_year_max:
            score += 1
            reasons.append(f"All-in rate €{all_in:,.0f}/m²/yr within budget")

    if criteria.energy_label:
        max_score += 1
        if building.energy_label and building.energy_label.upper() == criteria.energy_label.upper():
            score += 1
            reasons.append(f"Energy label {building.energy_label}")

    if criteria.required_amenities:
        max_score += len(criteria.required_amenities)
        available = {a.lower() for a in (unit.unit_amenities or []) + (building.building_amenities or [])}
        for amenity in criteria.required_amenities:
            if any(amenity.lower() in a for a in available):
                score += 1
                reasons.append(f"Has '{amenity}'")

    if criteria.near_public_transport:
        max_score += 1
        if building.neighbourhood and building.neighbourhood.public_transport:
            score += 1
            reasons.append("Near public transport")

    normalized = score / max_score if max_score else 0.0
    return MatchResult(unit=unit, score=round(normalized, 3), reasons=reasons)


def match_units(db: Session, criteria: MatchCriteria, limit: int = 20) -> list[MatchResult]:
    units = db.query(Unit).all()
    results = [score_unit(unit, unit.building, criteria) for unit in units]
    results.sort(key=lambda r: r.score, reverse=True)
    return results[:limit]
