"""§5.1 Building — static, physical facts about the asset."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class Building(Base):
    __tablename__ = "buildings"

    building_id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String, nullable=False)

    address: Mapped[str] = mapped_column(String, nullable=False)
    postal_code: Mapped[str | None] = mapped_column(String, nullable=True)
    city: Mapped[str] = mapped_column(String, nullable=False)
    country: Mapped[str] = mapped_column(String, default="Netherlands")

    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)

    neighbourhood_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("neighbourhoods.neighbourhood_id"), nullable=True
    )
    submarket: Mapped[str | None] = mapped_column(String, nullable=True)
    building_type: Mapped[str | None] = mapped_column(String, nullable=True)

    year_built: Mapped[int | None] = mapped_column(Integer, nullable=True)
    renovation_year: Mapped[int | None] = mapped_column(Integer, nullable=True)

    energy_label: Mapped[str | None] = mapped_column(String, nullable=True)
    breeam_rating: Mapped[str | None] = mapped_column(String, nullable=True)

    total_building_area_m2: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Per-building distances shown on the "Market Inventory" template's fact
    # sheets (e.g. "A10 3 km", "Schiphol 11 km") — genuinely building-specific,
    # unlike the shared Neighbourhood.public_transport facts (§5.4).
    accessibility_note: Mapped[str | None] = mapped_column(String, nullable=True)
    airport_note: Mapped[str | None] = mapped_column(String, nullable=True)

    building_amenities: Mapped[list] = mapped_column(JSON, default=list)

    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    photos: Mapped[list] = mapped_column(JSON, default=list)
    source_url: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    neighbourhood: Mapped["Neighbourhood"] = relationship(back_populates="buildings")
    units: Mapped[list["Unit"]] = relationship(back_populates="building", cascade="all, delete-orphan")
    addons: Mapped[list["AddOn"]] = relationship(
        back_populates="building",
        cascade="all, delete-orphan",
        foreign_keys="AddOn.building_id",
    )
