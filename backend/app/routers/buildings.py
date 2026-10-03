from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import schemas
from app.database import get_db
from app.models import Building, Client, Listing, ProposalUnit, Selection
from app.services.building_copy import copy_building_to_client
from app.services.scraping.deduplicator import find_similar_buildings

router = APIRouter(prefix="/buildings", tags=["buildings"])


@router.get("", response_model=list[schemas.BuildingWithUnits])
def list_buildings(city: str | None = None, client_id: str | None = None, db: Session = Depends(get_db)):
    """No client_id -> the shared library (masters only, client_id IS NULL —
    a client's copies never leak into the library view). client_id=X -> only
    that client's folder (their copies only — never the full library)."""
    query = db.query(Building)
    if client_id:
        query = query.filter(Building.client_id == client_id)
    else:
        query = query.filter(Building.client_id.is_(None))
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
    # client_id/source_building_id are set only by the copy operation below,
    # never by a normal edit — the edit form doesn't know about them and
    # would otherwise send them back as None, silently un-scoping a client's
    # copy back into the shared library.
    for key, value in payload.model_dump(exclude={"client_id", "source_building_id"}).items():
        setattr(obj, key, value)
    db.commit()
    db.refresh(obj)
    return obj


@router.post("/{building_id}/copy-to-client", response_model=schemas.BuildingWithUnits, status_code=201)
def copy_to_client(building_id: str, payload: schemas.CopyToClientRequest, db: Session = Depends(get_db)):
    """"Add from library" in a client folder — deep-copies the library
    master (and its Units/AddOns) into a fully independent set of rows
    scoped to this client. See services/building_copy.py for why: once a
    PDF with specific terms has gone out, it must never silently change
    because someone updated the master afterward."""
    master = db.get(Building, building_id)
    if not master:
        raise HTTPException(404, "Building not found")
    if master.client_id is not None:
        raise HTTPException(400, "Can only copy a library master, not another client's copy.")
    client = db.get(Client, payload.client_id)
    if not client:
        raise HTTPException(404, "Client not found")
    copy = copy_building_to_client(db, master, client_id=payload.client_id)
    return copy


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
