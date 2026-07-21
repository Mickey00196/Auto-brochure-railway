"""§5.6 Proposal CRUD — Workflow 1 (§4): select Units, attach to a Client,
create/update a Proposal. Every export (PDF/PPTX/one-pager/comparison) is
generated from this one record, so they stay in sync.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import schemas
from app.database import get_db
from app.models import Proposal, ProposalUnit, Unit

router = APIRouter(prefix="/proposals", tags=["proposals"])


def _sync_unit_links(db: Session, proposal: Proposal, unit_ids: list[str]) -> None:
    existing_unit_ids = {u.unit_id for u in db.query(Unit).filter(Unit.unit_id.in_(unit_ids)).all()}
    missing = set(unit_ids) - existing_unit_ids
    if missing:
        raise HTTPException(400, f"Unknown unit_id(s): {sorted(missing)}")

    db.query(ProposalUnit).filter(ProposalUnit.proposal_id == proposal.proposal_id).delete()
    for rank, unit_id in enumerate(unit_ids):
        db.add(ProposalUnit(proposal_id=proposal.proposal_id, unit_id=unit_id, display_rank=rank))


@router.get("", response_model=list[schemas.ProposalOut])
def list_proposals(client_id: str | None = None, db: Session = Depends(get_db)):
    query = db.query(Proposal)
    if client_id:
        query = query.filter(Proposal.client_id == client_id)
    return query.all()


@router.post("", response_model=schemas.ProposalOut, status_code=201)
def create_proposal(payload: schemas.ProposalCreate, db: Session = Depends(get_db)):
    data = payload.model_dump(exclude={"unit_ids"})
    obj = Proposal(**data)
    db.add(obj)
    db.flush()
    _sync_unit_links(db, obj, payload.unit_ids)
    db.commit()
    db.refresh(obj)
    return obj


@router.get("/{proposal_id}", response_model=schemas.ProposalWithUnits)
def get_proposal(proposal_id: str, db: Session = Depends(get_db)):
    obj = db.get(Proposal, proposal_id)
    if not obj:
        raise HTTPException(404, "Proposal not found")
    return obj


@router.put("/{proposal_id}", response_model=schemas.ProposalOut)
def update_proposal(proposal_id: str, payload: schemas.ProposalUpdate, db: Session = Depends(get_db)):
    obj = db.get(Proposal, proposal_id)
    if not obj:
        raise HTTPException(404, "Proposal not found")

    updates = payload.model_dump(exclude_unset=True, exclude={"unit_ids"})
    for key, value in updates.items():
        setattr(obj, key, value)

    if payload.unit_ids is not None:
        _sync_unit_links(db, obj, payload.unit_ids)

    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{proposal_id}", status_code=204)
def delete_proposal(proposal_id: str, db: Session = Depends(get_db)):
    obj = db.get(Proposal, proposal_id)
    if not obj:
        raise HTTPException(404, "Proposal not found")
    db.delete(obj)
    db.commit()
