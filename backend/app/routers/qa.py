"""§8 QA pass, exposed per-Proposal so a broker can check export-readiness
before generating documents, and §18's Data Completeness dashboard widget
can reuse the same logic.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Proposal
from app.services.qa import run_qa_pass

router = APIRouter(prefix="/proposals", tags=["qa"])


@router.get("/{proposal_id}/qa")
def get_qa_report(
    proposal_id: str,
    acknowledged_unit_ids: list[str] = Query(default=[]),
    db: Session = Depends(get_db),
):
    proposal = db.get(Proposal, proposal_id)
    if not proposal:
        raise HTTPException(404, "Proposal not found")
    report = run_qa_pass(db, proposal, acknowledged_unit_ids=set(acknowledged_unit_ids))
    return report.to_dict()
