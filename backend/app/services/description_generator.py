"""§9 AI Description Generator.

Never copy source descriptions literally — generate original, premium CRE
copy. This module defines a pluggable `DescriptionProvider` protocol so a
real LLM can be swapped in (OpenAI, Anthropic, etc.) via app.config
OPENAI_API_KEY; without a key configured, `TemplatedDescriptionProvider`
produces deterministic, on-brand copy from structured Unit/Building fields
so the app runs and demoes with zero external configuration.
"""
from __future__ import annotations

from typing import Protocol

from app.models import Building, Unit

_STYLE_ADJECTIVES = {
    "turn_key": "move-in ready",
    "shell_and_core": "flexible fit-out potential",
    "shell_and_core_plus": "premium base-build specification",
    "mixed": "adaptable delivery condition",
}


class DescriptionProvider(Protocol):
    def generate_building_description(self, building: Building) -> str: ...

    def generate_unit_description(self, unit: Unit, building: Building) -> str: ...


class TemplatedDescriptionProvider:
    """Deterministic fallback — no external API required."""

    def generate_building_description(self, building: Building) -> str:
        amenity_phrase = ""
        if building.building_amenities:
            amenity_phrase = f" featuring {_join_amenities(building.building_amenities)}"
        label_phrase = f" Energy label {building.energy_label}." if building.energy_label else ""
        return (
            f"{building.name} offers a {building.building_type or 'premium office'} environment in "
            f"{building.submarket or building.city}{amenity_phrase}.{label_phrase} Prime accessibility "
            "and exceptional presentation make this an outstanding opportunity for occupiers seeking a "
            "distinctive base in Amsterdam."
        )

    def generate_unit_description(self, unit: Unit, building: Building) -> str:
        condition_phrase = _STYLE_ADJECTIVES.get(
            unit.delivery_condition.value if hasattr(unit.delivery_condition, "value") else unit.delivery_condition,
            "premium specification",
        )
        area_phrase = f"{unit.available_area_m2:,.0f} m²"
        if unit.min_divisible_area_m2:
            area_phrase += f", divisible from {unit.min_divisible_area_m2:,.0f} m²"
        floor_phrase = f" on the {unit.floor}" if unit.floor else ""
        return (
            f"A {condition_phrase} office suite of {area_phrase}{floor_phrase} at {building.name}. "
            f"{_join_amenities(unit.unit_amenities) if unit.unit_amenities else 'A well-specified workplace'} "
            "combine to deliver an exceptional environment for growing teams."
        )


def _join_amenities(amenities: list[str]) -> str:
    if not amenities:
        return ""
    if len(amenities) == 1:
        return amenities[0]
    return ", ".join(amenities[:-1]) + f" and {amenities[-1]}"


def get_description_provider() -> DescriptionProvider:
    """Swap point for a real LLM-backed provider once OPENAI_API_KEY (or an
    Anthropic key) is configured. Kept as a single factory function so
    callers never need to know which provider is active.
    """
    return TemplatedDescriptionProvider()
