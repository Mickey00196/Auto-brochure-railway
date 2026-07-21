from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import schemas
from app.database import get_db
from app.models import AddOn

router = APIRouter(prefix="/addons", tags=["addons"])


@router.get("", response_model=list[schemas.AddOnOut])
def list_addons(unit_id: str | None = None, building_id: str | None = None, db: Session = Depends(get_db)):
    query = db.query(AddOn)
    if unit_id:
        query = query.filter(AddOn.unit_id == unit_id)
    if building_id:
        query = query.filter(AddOn.building_id == building_id)
    return query.all()


@router.post("", response_model=schemas.AddOnOut, status_code=201)
def create_addon(payload: schemas.AddOnCreate, db: Session = Depends(get_db)):
    if not payload.unit_id and not payload.building_id:
        raise HTTPException(400, "AddOn must reference a unit_id or a building_id")
    obj = AddOn(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{addon_id}", status_code=204)
def delete_addon(addon_id: str, db: Session = Depends(get_db)):
    obj = db.get(AddOn, addon_id)
    if not obj:
        raise HTTPException(404, "AddOn not found")
    db.delete(obj)
    db.commit()
