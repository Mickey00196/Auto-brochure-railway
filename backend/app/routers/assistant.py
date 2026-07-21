"""§17 AI Assistant router."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Client
from app.services.assistant import draft_client_email, parse_query
from app.services.matching import match_units

router = APIRouter(prefix="/assistant", tags=["assistant"])


class AssistantQuery(BaseModel):
    text: str
    client_id: str | None = None
    limit: int = 10


@router.post("/query")
def assistant_query(payload: AssistantQuery, db: Session = Depends(get_db)):
    parsed = parse_query(payload.text)
    results = match_units(db, parsed.criteria, limit=payload.limit)

    matches = [
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

    draft_email = None
    if payload.client_id:
        client = db.get(Client, payload.client_id)
        if not client:
            raise HTTPException(404, "Client not found")
        draft_email = draft_client_email(
            client_name=client.company_name,
            proposal_title=f"Office Shortlist for {client.company_name}",
            unit_count=len(matches),
            prepared_by="Your Advisor",
        )

    return {
        "interpreted_criteria": {
            "city": parsed.criteria.city,
            "budget_eur_per_m2_year_max": parsed.criteria.budget_eur_per_m2_year_max,
            "size_m2_min": parsed.criteria.size_m2_min,
            "size_m2_max": parsed.criteria.size_m2_max,
            "energy_label": parsed.criteria.energy_label,
            "near_public_transport": parsed.criteria.near_public_transport,
        },
        "matches": matches,
        "draft_email": draft_email,
        "next_actions": ["generate_brochure", "generate_pptx", "draft_client_email"],
    }
