"""§5.2 Unit — what's actually for lease.

One Building can have several Units at different floors/prices/conditions.
This is the fix for gap #1 (Danzigerkade 13-G's two independent units;
Moermanskkade 600's per-floor availability) and gap #6 (contract_term as a
first-class field instead of free text with no structured home).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Enum, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import DeliveryCondition, PricingModel, RentPriceType, ServiceChargePriceType


def _uuid() -> str:
    return str(uuid.uuid4())


class Unit(Base):
    __tablename__ = "units"

    unit_id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    building_id: Mapped[str] = mapped_column(String, ForeignKey("buildings.building_id"), nullable=False)

    floor: Mapped[str | None] = mapped_column(String, nullable=True)
    available_area_m2: Mapped[float] = mapped_column(Float, nullable=False)
    min_divisible_area_m2: Mapped[float | None] = mapped_column(Float, nullable=True)

    delivery_condition: Mapped[DeliveryCondition] = mapped_column(
        Enum(DeliveryCondition), default=DeliveryCondition.SHELL_AND_CORE
    )

    # Direct-lease pricing (per_sqm_annual) — the original 7-listing brochure's shape.
    rent_price_type: Mapped[RentPriceType] = mapped_column(Enum(RentPriceType), default=RentPriceType.TBD)
    rent_eur_per_m2_year: Mapped[float | None] = mapped_column(Float, nullable=True)

    service_charge_price_type: Mapped[ServiceChargePriceType] = mapped_column(
        Enum(ServiceChargePriceType), default=ServiceChargePriceType.TBD
    )
    service_charge_eur_per_m2_year: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Flexible/serviced-office pricing (per_desk_monthly) — the "Market Inventory"
    # template's shape: EUR per desk per month instead of EUR per m² per year.
    pricing_model: Mapped[PricingModel] = mapped_column(Enum(PricingModel), default=PricingModel.PER_SQM_ANNUAL)
    desk_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    price_per_desk_month_eur: Mapped[float | None] = mapped_column(Float, nullable=True)
    space_provider: Mapped[str | None] = mapped_column(String, nullable=True)
    meeting_room_note: Mapped[str | None] = mapped_column(String, nullable=True)
    parking_ratio: Mapped[str | None] = mapped_column(String, nullable=True)

    contract_term: Mapped[str | None] = mapped_column(String, nullable=True)
    contract_term_years: Mapped[int | None] = mapped_column(Integer, nullable=True)

    availability: Mapped[str | None] = mapped_column(String, nullable=True)

    unit_amenities: Mapped[list] = mapped_column(JSON, default=list)
    photos: Mapped[list] = mapped_column(JSON, default=list)
    floorplan_url: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    building: Mapped["Building"] = relationship(back_populates="units")
    addons: Mapped[list["AddOn"]] = relationship(
        back_populates="unit",
        cascade="all, delete-orphan",
        foreign_keys="AddOn.unit_id",
    )
    proposal_links: Mapped[list["ProposalUnit"]] = relationship(back_populates="unit")

    def is_price_ready(self) -> bool:
        """§8/§24: a headline field is export-ready only once it's a real number.
        Branches on pricing_model since a flex/monthly unit's headline price
        lives in a different field than a direct-lease unit's."""
        if self.pricing_model == PricingModel.PER_DESK_MONTHLY:
            return self.price_per_desk_month_eur is not None and self.desk_count is not None
        rent_ready = self.rent_price_type != "tbd" and self.rent_eur_per_m2_year is not None
        service_ready = (
            self.service_charge_price_type != "tbd" and self.service_charge_eur_per_m2_year is not None
        )
        return rent_ready and service_ready
