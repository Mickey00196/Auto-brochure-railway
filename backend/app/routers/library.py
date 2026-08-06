"""Step 4 of the core workflow: selected buildings → client PDF.

The building library is the single source of truth (step 2), and a client is
only attached at generation time — so this deliberately does NOT require a
stored Client or Proposal record. Pick buildings, type who it's for, get the
PDF. Nothing is written to the database by generating one, which is what
makes a building freely reusable across any number of client PDFs.
"""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.brochure.availability_pdf import build_library_pdf

router = APIRouter(prefix="/library", tags=["library"])


class LibraryPdfRequest(BaseModel):
    client_name: str = Field(min_length=1, description="Who the overview is for — shown on the cover")
    building_ids: list[str] = Field(min_length=1, description="Selection order is preserved in the PDF")
    prepared_by: str | None = None


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "availability"


@router.post("/pdf")
def generate_library_pdf(payload: LibraryPdfRequest, db: Session = Depends(get_db)):
    pdf_bytes = build_library_pdf(
        db,
        client_name=payload.client_name.strip(),
        building_ids=payload.building_ids,
        prepared_by=(payload.prepared_by or "").strip() or None,
    )
    if not pdf_bytes:
        raise HTTPException(500, "Could not generate the PDF")
    filename = f"availability-{_slug(payload.client_name)}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
