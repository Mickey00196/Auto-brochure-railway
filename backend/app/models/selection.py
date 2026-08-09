"""A named, saved subset of the building library for one client.

The library (Building) is never owned by a client and stays reusable
(§ library.py) — generating a PDF from it writes nothing to the database.
A Selection is the deliberate opposite: an explicit, persisted pick of
building_ids plus who it's for, so a broker can come back to it, adjust
which buildings are in or out, or duplicate it as the starting point for a
similar client, instead of re-picking from the whole library every time.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class Selection(Base):
    __tablename__ = "selections"

    selection_id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    client_name: Mapped[str] = mapped_column(String, nullable=False)
    prepared_by: Mapped[str | None] = mapped_column(String, nullable=True)

    # Ordered list of building_ids — the order shown here is the order they
    # appear in the generated PDF.
    building_ids: Mapped[list] = mapped_column(JSON, default=list)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )
