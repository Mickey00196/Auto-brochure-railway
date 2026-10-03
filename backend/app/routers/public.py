"""Unauthenticated read-only endpoints for a client's shareable live link —
see POST /clients/{id}/live. Mounted in main.py WITHOUT the get_current_user
dependency every other router gets; keep this file's surface area to exactly
what a link recipient (no account, no session) is meant to see."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import schemas
from app.database import get_db
from app.models import Client

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/clients/{slug}", response_model=schemas.PublicClientOut)
def get_public_client(slug: str, db: Session = Depends(get_db)):
    obj = db.query(Client).filter(Client.public_slug == slug).first()
    if not obj or not obj.live:
        # Same 404 whether the slug never existed or was turned back off —
        # never reveal which, to a visitor with no credentials.
        raise HTTPException(404, "Not found")
    return obj
