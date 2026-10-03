"""§5.5 Client."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class Client(Base):
    __tablename__ = "clients"

    client_id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    # The "client folder" display name — always present. company_name predates
    # this feature and used to be the only name a Client had (required); kept
    # as an optional second field rather than dropped, since existing Client
    # rows (and Proposal, which still FKs to Client) already rely on it.
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    company_name: Mapped[str | None] = mapped_column(String, nullable=True)
    industry: Mapped[str | None] = mapped_column(String, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String, nullable=True)

    # list[dict]: e.g. [{"name": "...", "role": "...", "email": "...", "phone": "..."}]
    contacts: Mapped[list] = mapped_column(JSON, default=list)

    # feeds §12 Property Matching: location, budget, size, must-haves
    search_brief: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    proposals: Mapped[list["Proposal"]] = relationship(back_populates="client")
    # Buildings copied into this client's folder — see models/building.py
    # client_id/source_building_id and services/building_copy.py. Deleting a
    # Client cascades its copies (they're meaningless without the folder);
    # the library masters they were copied from are never touched.
    buildings: Mapped[list["Building"]] = relationship(
        back_populates="client", cascade="all, delete-orphan", foreign_keys="Building.client_id"
    )

    @property
    def display_name(self) -> str:
        return self.name or self.company_name or "Unnamed client"

    @property
    def building_count(self) -> int:
        return len(self.buildings)
