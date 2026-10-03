from __future__ import annotations

import re
import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import schemas
from app.database import get_db
from app.models import Client

router = APIRouter(prefix="/clients", tags=["clients"])


def _slugify(text: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return base or "client"


def _unique_slug(db: Session, display_name: str) -> str:
    base = _slugify(display_name)
    for _ in range(10):
        candidate = f"{base}-{secrets.token_hex(3)}"
        if not db.query(Client).filter(Client.public_slug == candidate).first():
            return candidate
    # Astronomically unlikely to ever loop this far, but never hang forever.
    return f"{base}-{secrets.token_hex(8)}"


@router.get("", response_model=list[schemas.ClientOut])
def list_clients(db: Session = Depends(get_db)):
    return db.query(Client).all()


@router.post("", response_model=schemas.ClientOut, status_code=201)
def create_client(payload: schemas.ClientCreate, db: Session = Depends(get_db)):
    obj = Client(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.get("/{client_id}", response_model=schemas.ClientOut)
def get_client(client_id: str, db: Session = Depends(get_db)):
    obj = db.get(Client, client_id)
    if not obj:
        raise HTTPException(404, "Client not found")
    return obj


@router.put("/{client_id}", response_model=schemas.ClientOut)
def update_client(client_id: str, payload: schemas.ClientCreate, db: Session = Depends(get_db)):
    obj = db.get(Client, client_id)
    if not obj:
        raise HTTPException(404, "Client not found")
    for key, value in payload.model_dump().items():
        setattr(obj, key, value)
    db.commit()
    db.refresh(obj)
    return obj


@router.post("/{client_id}/live", response_model=schemas.ClientOut)
def set_client_live(client_id: str, payload: schemas.SetClientLiveRequest, db: Session = Depends(get_db)):
    """Turn this client's shareable link on or off. The slug is generated
    once, the first time a client goes live, and then kept — so re-enabling
    later reuses the same link rather than silently breaking one someone
    already sent out."""
    obj = db.get(Client, client_id)
    if not obj:
        raise HTTPException(404, "Client not found")
    if payload.enable:
        if not obj.public_slug:
            obj.public_slug = _unique_slug(db, obj.display_name)
        obj.is_live = True
    else:
        obj.is_live = False
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{client_id}", status_code=204)
def delete_client(client_id: str, db: Session = Depends(get_db)):
    """Cascades to every building copied into this client's folder
    (models/client.py Client.buildings relationship) — the library masters
    they were copied from are untouched."""
    obj = db.get(Client, client_id)
    if not obj:
        raise HTTPException(404, "Client not found")
    db.delete(obj)
    db.commit()
