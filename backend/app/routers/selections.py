"""Named, saved shortlists — the counterpart to the library (§ library.py).

The library page picks buildings and generates a PDF without saving
anything, on purpose (any building, any client, no ownership). A Selection
is the opt-in exception: explicitly saving that pick under a client's name
so it can be reopened, adjusted, or duplicated later instead of rebuilt
from scratch.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import schemas
from app.database import get_db
from app.models import Selection

router = APIRouter(prefix="/selections", tags=["selections"])


@router.get("", response_model=list[schemas.SelectionOut])
def list_selections(db: Session = Depends(get_db)):
    return db.query(Selection).order_by(Selection.updated_at.desc()).all()


@router.post("", response_model=schemas.SelectionOut, status_code=201)
def create_selection(payload: schemas.SelectionCreate, db: Session = Depends(get_db)):
    obj = Selection(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.get("/{selection_id}", response_model=schemas.SelectionOut)
def get_selection(selection_id: str, db: Session = Depends(get_db)):
    obj = db.get(Selection, selection_id)
    if not obj:
        raise HTTPException(404, "Selection not found")
    return obj


@router.put("/{selection_id}", response_model=schemas.SelectionOut)
def update_selection(selection_id: str, payload: schemas.SelectionUpdate, db: Session = Depends(get_db)):
    obj = db.get(Selection, selection_id)
    if not obj:
        raise HTTPException(404, "Selection not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{selection_id}", status_code=204)
def delete_selection(selection_id: str, db: Session = Depends(get_db)):
    obj = db.get(Selection, selection_id)
    if not obj:
        raise HTTPException(404, "Selection not found")
    db.delete(obj)
    db.commit()
