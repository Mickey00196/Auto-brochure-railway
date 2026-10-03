from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import schemas
from app.database import get_db
from app.models import Unit

router = APIRouter(prefix="/units", tags=["units"])


@router.get("", response_model=list[schemas.UnitWithBuilding])
def list_units(building_id: str | None = None, db: Session = Depends(get_db)):
    query = db.query(Unit)
    if building_id:
        query = query.filter(Unit.building_id == building_id)
    return query.all()


@router.post("", response_model=schemas.UnitOut, status_code=201)
def create_unit(payload: schemas.UnitCreate, db: Session = Depends(get_db)):
    obj = Unit(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.get("/{unit_id}", response_model=schemas.UnitWithBuilding)
def get_unit(unit_id: str, db: Session = Depends(get_db)):
    obj = db.get(Unit, unit_id)
    if not obj:
        raise HTTPException(404, "Unit not found")
    return obj


@router.put("/{unit_id}", response_model=schemas.UnitOut)
def update_unit(unit_id: str, payload: schemas.UnitCreate, db: Session = Depends(get_db)):
    obj = db.get(Unit, unit_id)
    if not obj:
        raise HTTPException(404, "Unit not found")
    for key, value in payload.model_dump().items():
        setattr(obj, key, value)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{unit_id}", status_code=204)
def delete_unit(unit_id: str, db: Session = Depends(get_db)):
    obj = db.get(Unit, unit_id)
    if not obj:
        raise HTTPException(404, "Unit not found")
    db.delete(obj)
    db.commit()
