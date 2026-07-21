"""§5.3 AddOn — optional costs (parking, service packages) outside headline rent.

Reference brochure: parking ranged from a genuinely cheap €618 to €2,750 per
space/year, buried in free-text bullets. Structuring it lets §8's outlier
check flag the €618 space sitting next to five others above €2,000.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class AddOn(Base):
    __tablename__ = "addons"

    addon_id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)

    unit_id: Mapped[str | None] = mapped_column(String, ForeignKey("units.unit_id"), nullable=True)
    building_id: Mapped[str | None] = mapped_column(String, ForeignKey("buildings.building_id"), nullable=True)

    name: Mapped[str] = mapped_column(String, nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)
    price_unit: Mapped[str] = mapped_column(String, nullable=False)  # e.g. "EUR / space / year"
    quantity_available: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    unit: Mapped["Unit"] = relationship(back_populates="addons", foreign_keys=[unit_id])
    building: Mapped["Building"] = relationship(back_populates="addons", foreign_keys=[building_id])
