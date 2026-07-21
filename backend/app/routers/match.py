"""§12 Property Matching."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.matching import MatchCriteria, match_units

router = APIRouter(prefix="/match", tags=["matching"])


class MatchRequest(BaseModel):
    city: str | None = None
    budget_eur_per_m2_year_max: float | None = None
    size_m2_min: float | None = None
    size_m2_max: float | None = None
    required_amenities: list[str] | None = None
    energy_label: str | None = None
    near_public_transport: bool = False
    limit: int = 20


@router.post("")
def match(payload: MatchRequest, db: Session = Depends(get_db)):
    criteria = MatchCriteria(
        city=payload.city,
        budget_eur_per_m2_year_max=payload.budget_eur_per_m2_year_max,
        size_m2_min=payload.size_m2_min,
        size_m2_max=payload.size_m2_max,
        required_amenities=payload.required_amenities,
        energy_label=payload.energy_label,
        near_public_transport=payload.near_public_transport,
    )
    results = match_units(db, criteria, limit=payload.limit)
    return [
        {
            "unit_id": r.unit.unit_id,
            "building_name": r.unit.building.name,
            "floor": r.unit.floor,
            "available_area_m2": r.unit.available_area_m2,
            "score": r.score,
            "reasons": r.reasons,
        }
        for r in results
    ]
