from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import schemas
from app.database import get_db
from app.models import Building

router = APIRouter(prefix="/buildings", tags=["buildings"])


@router.get("", response_model=list[schemas.BuildingWithUnits])
def list_buildings(city: str | None = None, db: Session = Depends(get_db)):
    query = db.query(Building)
    if city:
        query = query.filter(Building.city == city)
    return query.all()


@router.post("", response_model=schemas.BuildingOut, status_code=201)
def create_building(payload: schemas.BuildingCreate, db: Session = Depends(get_db)):
    obj = Building(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.get("/{building_id}", response_model=schemas.BuildingWithUnits)
def get_building(building_id: str, db: Session = Depends(get_db)):
    obj = db.get(Building, building_id)
    if not obj:
        raise HTTPException(404, "Building not found")
    return obj


@router.put("/{building_id}", response_model=schemas.BuildingOut)
def update_building(building_id: str, payload: schemas.BuildingCreate, db: Session = Depends(get_db)):
    obj = db.get(Building, building_id)
    if not obj:
        raise HTTPException(404, "Building not found")
    for key, value in payload.model_dump().items():
        setattr(obj, key, value)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{building_id}", status_code=204)
def delete_building(building_id: str, db: Session = Depends(get_db)):
    obj = db.get(Building, building_id)
    if not obj:
        raise HTTPException(404, "Building not found")
    db.delete(obj)
    db.commit()
