from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import schemas
from app.database import get_db
from app.models import Neighbourhood

router = APIRouter(prefix="/neighbourhoods", tags=["neighbourhoods"])


@router.get("", response_model=list[schemas.NeighbourhoodOut])
def list_neighbourhoods(db: Session = Depends(get_db)):
    return db.query(Neighbourhood).all()


@router.post("", response_model=schemas.NeighbourhoodOut, status_code=201)
def create_neighbourhood(payload: schemas.NeighbourhoodCreate, db: Session = Depends(get_db)):
    obj = Neighbourhood(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.get("/{neighbourhood_id}", response_model=schemas.NeighbourhoodOut)
def get_neighbourhood(neighbourhood_id: str, db: Session = Depends(get_db)):
    obj = db.get(Neighbourhood, neighbourhood_id)
    if not obj:
        raise HTTPException(404, "Neighbourhood not found")
    return obj
