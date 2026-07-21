"""§5.6 Proposal — the thing that's actually sent.

Every brochure/PPTX/one-pager is a rendering of one Proposal record, so all
outputs stay in sync (Workflow 1, §4).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import ProposalStatus


def _uuid() -> str:
    return str(uuid.uuid4())


class ProposalUnit(Base):
    """Ordered M:N: a selected Unit within a Proposal, with display rank."""

    __tablename__ = "proposal_units"

    proposal_id: Mapped[str] = mapped_column(
        String, ForeignKey("proposals.proposal_id"), primary_key=True
    )
    unit_id: Mapped[str] = mapped_column(String, ForeignKey("units.unit_id"), primary_key=True)
    display_rank: Mapped[int] = mapped_column(Integer, default=0)

    proposal: Mapped["Proposal"] = relationship(back_populates="unit_links")
    unit: Mapped["Unit"] = relationship(back_populates="proposal_links")


class Proposal(Base):
    __tablename__ = "proposals"

    proposal_id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    client_id: Mapped[str] = mapped_column(String, ForeignKey("clients.client_id"), nullable=False)

    title: Mapped[str] = mapped_column(String, nullable=False)
    prepared_by: Mapped[str | None] = mapped_column(String, nullable=True)
    prepared_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    status: Mapped[ProposalStatus] = mapped_column(Enum(ProposalStatus), default=ProposalStatus.DRAFT)

    # Cover-page fields mirroring the "Market Inventory" template: eyebrow
    # (document_type), big title (the client's name, rendered by the
    # frontend/generator — not stored twice), subtitle (search_area_label).
    document_type: Mapped[str] = mapped_column(String, default="Market Inventory")
    search_area_label: Mapped[str | None] = mapped_column(String, nullable=True)

    # list[dict]: e.g. [{"name": "...", "email": "...", "phone": "...", "photo": "..."}]
    # — the closing "Project Team" page's contact cards.
    project_team: Mapped[list] = mapped_column(JSON, default=list)

    # list[dict]: e.g. [{"format": "pptx", "url": "...", "generated_at": "..."}]
    generated_outputs: Mapped[list] = mapped_column(JSON, default=list)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    client: Mapped["Client"] = relationship(back_populates="proposals")
    unit_links: Mapped[list["ProposalUnit"]] = relationship(
        back_populates="proposal",
        cascade="all, delete-orphan",
        order_by="ProposalUnit.display_rank",
    )

    @property
    def selected_units(self) -> list["Unit"]:
        return [link.unit for link in sorted(self.unit_links, key=lambda l: l.display_rank)]

    @property
    def selected_unit_ids(self) -> list[str]:
        return [link.unit_id for link in sorted(self.unit_links, key=lambda l: l.display_rank)]
