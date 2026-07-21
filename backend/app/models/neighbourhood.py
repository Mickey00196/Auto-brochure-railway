"""§5.4 Neighbourhood / Submarket.

Owns area-level facts (transit, amenities) once so that units/buildings
inherit rather than repeat them. Reference brochure: all 7/7 listings
repeated "Bus 48 nearby to Amsterdam Central" verbatim — that fact belongs
here, not on every Unit.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class Neighbourhood(Base):
    __tablename__ = "neighbourhoods"

    neighbourhood_id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String, nullable=False)
    city: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # list[dict]: e.g. [{"line": "Bus 48", "station": "Amsterdam Centraal", "walking_time_min": 12}]
    public_transport: Mapped[list] = mapped_column(JSON, default=list)
    # list[dict]: e.g. [{"category": "restaurant", "name": "...", "walking_time_min": 5}]
    nearby_amenities: Mapped[list] = mapped_column(JSON, default=list)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    buildings: Mapped[list["Building"]] = relationship(back_populates="neighbourhood")
