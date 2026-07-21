"""§16 Comparison Generator, exposed per-Proposal."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Proposal
from app.services.comparison import build_comparison_table

router = APIRouter(prefix="/proposals", tags=["comparison"])


@router.get("/{proposal_id}/comparison")
def get_comparison(proposal_id: str, db: Session = Depends(get_db)):
    proposal = db.get(Proposal, proposal_id)
    if not proposal:
        raise HTTPException(404, "Proposal not found")
    rows = build_comparison_table(proposal.selected_units)
    return [row.to_dict() for row in rows]
