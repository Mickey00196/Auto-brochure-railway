"""Demo-data endpoint — reseeds the reference-brochure dataset (§1) so the
frontend has a one-click way to get into a populated state."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import schemas
from app.database import get_db
from app.seed.seed_data import seed_database

router = APIRouter(prefix="/seed", tags=["seed"])


@router.post("/demo", response_model=schemas.ProposalOut)
def seed_demo(db: Session = Depends(get_db)):
    proposal = seed_database(db)
    return proposal
