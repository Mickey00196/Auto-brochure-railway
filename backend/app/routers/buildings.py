from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import schemas
from app.database import get_db
from app.models import Building, Listing, ProposalUnit, Selection
from app.services.scraping.deduplicator import find_similar_buildings

router = APIRouter(prefix="/buildings", tags=["buildings"])


@router.get("", response_model=list[schemas.BuildingWithUnits])
def list_buildings(city: str | None = None, db: Session = Depends(get_db)):
    query = db.query(Building)
    if city:
        query = query.filter(Building.city == city)
    return query.all()


# Registered ahead of GET /{building_id} — Starlette matches routes in
# registration order, and "check-duplicate" would otherwise be swallowed as
# a building_id path param.
@router.get("/check-duplicate", response_model=list[schemas.DuplicateCandidate])
def check_duplicate(
    address: str = "",
    city: str = "",
    postal_code: str | None = None,
    name: str = "",
    exclude_building_id: str | None = None,
    db: Session = Depends(get_db),
):
    """Powers the Add Building form's live "this looks similar to..."
    warning — called debounced as someone types, so it needs to stay cheap;
    find_similar_buildings runs entirely in Python over one team's
    buildings table, not a network call, so it comfortably does."""
    if not address.strip() and not city.strip():
        return []
    candidates = find_similar_buildings(
        db,
        address=address,
        city=city,
        postal_code=postal_code,
        name=name,
        exclude_building_id=exclude_building_id,
    )
    return [
        schemas.DuplicateCandidate(
            building_id=c.building.building_id,
            name=c.building.name,
            address=c.building.address,
            city=c.building.city,
            space_count=len(c.building.units),
            is_draft=len(c.building.units) == 0,
            thumbnail_url=(c.building.photos or [None])[0],
            similarity_score=c.score,
            tier=c.tier,
        )
        for c in candidates
    ]


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
    """Units and building-level add-ons cascade via the ORM relationship
    (§ models/building.py). Everything below is cleanup for references the
    cascade doesn't reach: the legacy Proposal workflow's unit links (would
    otherwise violate a foreign key on Postgres), an ingestion Listing's
    pointer back to this building, and this building's id inside any saved
    Selection (§ models/selection.py) — left in place it's harmless (the
    selection UI already filters out ids that no longer resolve), but
    pruning it here keeps a saved selection's building_ids accurate."""
    obj = db.get(Building, building_id)
    if not obj:
        raise HTTPException(404, "Building not found")

    unit_ids = [u.unit_id for u in obj.units]
    if unit_ids:
        db.query(ProposalUnit).filter(ProposalUnit.unit_id.in_(unit_ids)).delete(synchronize_session=False)

    db.query(Listing).filter(Listing.building_id == building_id).update(
        {"building_id": None}, synchronize_session=False
    )

    for selection in db.query(Selection).all():
        if building_id in (selection.building_ids or []):
            selection.building_ids = [b for b in selection.building_ids if b != building_id]

    db.delete(obj)
    db.commit()
