"""§16 Comparison Generator.

The reference brochure never showed a combined €/m²/year or an estimated
annual cost — readers had to do that math themselves across 7 different
rent/service-charge pairs (§1 row 7). This module computes both, and is the
single place both the Comparison Generator output and the PPTX "Comparison"
slide (§14) pull from — so the number a client sees is always computed the
same way.

Units can be priced two ways (`Unit.pricing_model`): direct-lease space per
m²/year, or flex/serviced-office space per desk/month (the "Market
Inventory" template's shape). The two are apples-to-oranges, so an all-in
rate is only computed for per_sqm_annual rows; per_desk_monthly rows get
their own `monthly_total_eur` figure instead of being forced into the same
column — and neither shape is ever conflated with "missing price" (`is_tbd`).
"""
from __future__ import annotations

from dataclasses import dataclass

from app.models import AddOn, Unit
from app.models.enums import PricingModel


def _enum_value(value) -> str:
    return value.value if hasattr(value, "value") else value


@dataclass
class ComparisonRow:
    unit_id: str
    building_name: str
    address: str
    floor: str | None
    available_area_m2: float
    pricing_model: str
    rent_eur_per_m2_year: float | None
    rent_price_type: str
    service_charge_eur_per_m2_year: float | None
    service_charge_price_type: str
    all_in_rate_eur_per_m2_year: float | None
    estimated_annual_cost_eur: float | None
    desk_count: int | None
    price_per_desk_month_eur: float | None
    monthly_total_eur: float | None
    is_tbd: bool
    energy_label: str | None
    contract_term: str | None
    availability: str | None
    parking_price_range: str | None

    def to_dict(self) -> dict:
        return {
            "unit_id": self.unit_id,
            "building_name": self.building_name,
            "address": self.address,
            "floor": self.floor,
            "available_area_m2": self.available_area_m2,
            "pricing_model": self.pricing_model,
            "rent_eur_per_m2_year": self.rent_eur_per_m2_year,
            "rent_price_type": self.rent_price_type,
            "service_charge_eur_per_m2_year": self.service_charge_eur_per_m2_year,
            "service_charge_price_type": self.service_charge_price_type,
            "all_in_rate_eur_per_m2_year": self.all_in_rate_eur_per_m2_year,
            "estimated_annual_cost_eur": self.estimated_annual_cost_eur,
            "desk_count": self.desk_count,
            "price_per_desk_month_eur": self.price_per_desk_month_eur,
            "monthly_total_eur": self.monthly_total_eur,
            "is_tbd": self.is_tbd,
            "energy_label": self.energy_label,
            "contract_term": self.contract_term,
            "availability": self.availability,
            "parking_price_range": self.parking_price_range,
        }


def _parking_price_range(addons: list[AddOn]) -> str | None:
    parking = [a for a in addons if "parking" in a.name.lower()]
    if not parking:
        return None
    prices = sorted(a.price for a in parking)
    # price_unit already reads like "EUR / space / year" — swap the leading
    # "EUR" for a "€" prefix on the number instead of stacking both symbols.
    unit_suffix = parking[0].price_unit.split("/", 1)[-1].strip()
    if prices[0] == prices[-1]:
        return f"€{prices[0]:,.0f} / {unit_suffix}"
    return f"€{prices[0]:,.0f}–€{prices[-1]:,.0f} / {unit_suffix}"


def build_comparison_row(unit: Unit, addons: list[AddOn] | None = None) -> ComparisonRow:
    addons = addons or (unit.addons or [])
    pricing_model = _enum_value(unit.pricing_model)

    all_in_rate = None
    annual_cost = None
    monthly_total = None

    if pricing_model == PricingModel.PER_DESK_MONTHLY.value:
        is_tbd = unit.price_per_desk_month_eur is None or unit.desk_count is None
        if not is_tbd:
            monthly_total = round(unit.price_per_desk_month_eur * unit.desk_count, 2)
    else:
        rent = unit.rent_eur_per_m2_year
        service = unit.service_charge_eur_per_m2_year
        is_tbd = (
            rent is None or service is None or unit.rent_price_type == "tbd" or unit.service_charge_price_type == "tbd"
        )
        if not is_tbd:
            all_in_rate = round(rent + service, 2)
            annual_cost = round(all_in_rate * unit.available_area_m2, 2)

    return ComparisonRow(
        unit_id=unit.unit_id,
        building_name=unit.building.name,
        address=unit.building.address,
        floor=unit.floor,
        available_area_m2=unit.available_area_m2,
        pricing_model=pricing_model,
        rent_eur_per_m2_year=unit.rent_eur_per_m2_year,
        rent_price_type=_enum_value(unit.rent_price_type),
        service_charge_eur_per_m2_year=unit.service_charge_eur_per_m2_year,
        service_charge_price_type=_enum_value(unit.service_charge_price_type),
        all_in_rate_eur_per_m2_year=all_in_rate,
        estimated_annual_cost_eur=annual_cost,
        desk_count=unit.desk_count,
        price_per_desk_month_eur=unit.price_per_desk_month_eur,
        monthly_total_eur=monthly_total,
        is_tbd=is_tbd,
        energy_label=unit.building.energy_label,
        contract_term=unit.contract_term,
        availability=unit.availability,
        parking_price_range=_parking_price_range(addons),
    )


def _sort_key(row: ComparisonRow) -> tuple[int, float]:
    if row.is_tbd:
        return (2, float("inf"))
    if row.pricing_model == PricingModel.PER_DESK_MONTHLY.value:
        return (1, row.price_per_desk_month_eur if row.price_per_desk_month_eur is not None else float("inf"))
    return (0, row.all_in_rate_eur_per_m2_year if row.all_in_rate_eur_per_m2_year is not None else float("inf"))


def build_comparison_table(units: list[Unit]) -> list[ComparisonRow]:
    """Default sort: ready per_sqm_annual rows first (ascending all-in rate),
    then ready per_desk_monthly rows (ascending desk price), then genuinely
    TBD rows last — the two pricing models are never mixed in the same rank."""
    rows = [build_comparison_row(unit) for unit in units]
    rows.sort(key=_sort_key)
    return rows
