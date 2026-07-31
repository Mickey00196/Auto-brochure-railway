"""Listing — one advertisement of a space on one source (Step 9).

A Building is the underlying asset; a Listing is how a given source markets a
space in it, so the same space can have several Listings (Funda, CBRE, a
landlord…). Listings link to a Building via `building_id` once the
deduplicator matches one — nullable, because a brand-new or low-confidence
listing may not have a confirmed building yet.

This is a NEW table: it's added by create_all on the next startup and does not
touch the existing buildings/units schema, so no existing data is affected.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Listing(Base):
    __tablename__ = "listings"

    listing_id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)

    # -- source identity (Step 5 source metadata) ------------------------
    source: Mapped[str] = mapped_column(String, index=True, nullable=False)
    source_listing_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    source_url: Mapped[str] = mapped_column(String, nullable=False)

    # -- links to the underlying asset (Step 9) --------------------------
    building_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("buildings.building_id"), nullable=True, index=True
    )
    match_confidence: Mapped[str | None] = mapped_column(String, nullable=True)  # exact|high|medium|low|none
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False)

    # -- property ---------------------------------------------------------
    building_name: Mapped[str | None] = mapped_column(String, nullable=True)
    address: Mapped[str | None] = mapped_column(String, nullable=True)
    street: Mapped[str | None] = mapped_column(String, nullable=True)
    house_number: Mapped[str | None] = mapped_column(String, nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String, nullable=True)
    city: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    construction_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    energy_label: Mapped[str | None] = mapped_column(String, nullable=True)

    # -- availability -----------------------------------------------------
    available_area_sqm: Mapped[float | None] = mapped_column(Float, nullable=True)
    min_area_sqm: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_area_sqm: Mapped[float | None] = mapped_column(Float, nullable=True)
    floor: Mapped[str | None] = mapped_column(String, nullable=True)
    availability_date: Mapped[str | None] = mapped_column(String, nullable=True)

    # -- financial --------------------------------------------------------
    asking_rent: Mapped[float | None] = mapped_column(Float, nullable=True)
    asking_rent_unit: Mapped[str | None] = mapped_column(String, nullable=True)
    asking_rent_period: Mapped[str | None] = mapped_column(String, nullable=True)
    service_charge: Mapped[float | None] = mapped_column(Float, nullable=True)
    service_charge_unit: Mapped[str | None] = mapped_column(String, nullable=True)
    parking_available: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    parking_spaces: Mapped[int | None] = mapped_column(Integer, nullable=True)
    parking_price: Mapped[float | None] = mapped_column(Float, nullable=True)

    # -- marketing --------------------------------------------------------
    title: Mapped[str | None] = mapped_column(String, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    amenities: Mapped[list] = mapped_column(JSON, default=list)
    image_urls: Mapped[list] = mapped_column(JSON, default=list)
    floorplan_urls: Mapped[list] = mapped_column(JSON, default=list)

    # -- broker -----------------------------------------------------------
    broker_name: Mapped[str | None] = mapped_column(String, nullable=True)
    broker_phone: Mapped[str | None] = mapped_column(String, nullable=True)
    broker_email: Mapped[str | None] = mapped_column(String, nullable=True)
    broker_url: Mapped[str | None] = mapped_column(String, nullable=True)

    # -- lifecycle / change tracking (Step 7) ----------------------------
    status: Mapped[str] = mapped_column(String, default="active")  # active | withdrawn
    content_hash: Mapped[str | None] = mapped_column(String, nullable=True)  # change detection
    first_seen_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    last_checked_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    scraped_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    building: Mapped["Building"] = relationship()  # noqa: F821
    price_history: Mapped[list["ListingPriceHistory"]] = relationship(
        back_populates="listing", cascade="all, delete-orphan", order_by="ListingPriceHistory.changed_at"
    )


class ListingPriceHistory(Base):
    """An append-only trail of the values that changed on a Listing over time
    (Step 7) — so rent reductions, area changes, and re-listings are queryable
    rather than lost to an overwrite."""

    __tablename__ = "listing_price_history"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    listing_id: Mapped[str] = mapped_column(
        String, ForeignKey("listings.listing_id"), index=True, nullable=False
    )

    asking_rent: Mapped[float | None] = mapped_column(Float, nullable=True)
    service_charge: Mapped[float | None] = mapped_column(Float, nullable=True)
    available_area_sqm: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str | None] = mapped_column(String, nullable=True)
    change_type: Mapped[str | None] = mapped_column(String, nullable=True)  # created|rent|area|status|...
    changed_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    listing: Mapped["Listing"] = relationship(back_populates="price_history")
