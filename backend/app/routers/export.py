"""§20 Export — PDF, PowerPoint, Word, Excel, JSON, CSV; §15 one-pager.

Every export reads from the same Proposal record (§5.6, §4 Workflow 1), and
every generation is gated by the §8 QA pass unless explicitly bypassed —
`force=true` maps to the human sign-off in §8/§24, not a way to skip QA
silently.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import EXPORT_DIR
from app.database import get_db
from app.models import Proposal
from app.services import export_formats
from app.services.brochure.one_pager import build_one_pager
from app.services.brochure.pdf_export import pptx_to_pdf
from app.services.brochure.pptx_generator import build_pptx

router = APIRouter(prefix="/proposals", tags=["export"])


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _get_proposal(proposal_id: str, db: Session) -> Proposal:
    proposal = db.get(Proposal, proposal_id)
    if not proposal:
        raise HTTPException(404, "Proposal not found")
    if not proposal.selected_units:
        raise HTTPException(400, "Proposal has no selected units")
    return proposal


def _record_output(db: Session, proposal: Proposal, fmt: str, path: Path) -> None:
    outputs = list(proposal.generated_outputs or [])
    outputs.append({"format": fmt, "path": str(path), "generated_at": datetime.now(timezone.utc).isoformat()})
    proposal.generated_outputs = outputs
    db.commit()


@router.post("/{proposal_id}/export/pptx")
def export_pptx(proposal_id: str, force: bool = False, db: Session = Depends(get_db)):
    proposal = _get_proposal(proposal_id, db)
    try:
        prs = build_pptx(db, proposal, require_qa_pass=not force)
    except ValueError as e:
        raise HTTPException(409, str(e)) from e
    out_path = EXPORT_DIR / f"{_slug(proposal.title)}-{proposal.proposal_id[:8]}.pptx"
    prs.save(out_path)
    _record_output(db, proposal, "pptx", out_path)
    return FileResponse(out_path, filename=out_path.name)


@router.post("/{proposal_id}/export/pdf")
def export_pdf(proposal_id: str, force: bool = False, db: Session = Depends(get_db)):
    proposal = _get_proposal(proposal_id, db)
    try:
        prs = build_pptx(db, proposal, require_qa_pass=not force)
    except ValueError as e:
        raise HTTPException(409, str(e)) from e
    pptx_path = EXPORT_DIR / f"{_slug(proposal.title)}-{proposal.proposal_id[:8]}.pptx"
    prs.save(pptx_path)
    pdf_path = pptx_to_pdf(pptx_path, EXPORT_DIR)
    _record_output(db, proposal, "pdf", pdf_path)
    return FileResponse(pdf_path, filename=pdf_path.name)


@router.post("/{proposal_id}/export/one-pager")
def export_one_pager(proposal_id: str, force: bool = False, as_pdf: bool = True, db: Session = Depends(get_db)):
    proposal = _get_proposal(proposal_id, db)
    try:
        prs = build_one_pager(db, proposal, require_qa_pass=not force)
    except ValueError as e:
        raise HTTPException(409, str(e)) from e
    pptx_path = EXPORT_DIR / f"{_slug(proposal.title)}-{proposal.proposal_id[:8]}-one-pager.pptx"
    prs.save(pptx_path)
    if not as_pdf:
        _record_output(db, proposal, "one_pager_pptx", pptx_path)
        return FileResponse(pptx_path, filename=pptx_path.name)
    pdf_path = pptx_to_pdf(pptx_path, EXPORT_DIR)
    _record_output(db, proposal, "one_pager", pdf_path)
    return FileResponse(pdf_path, filename=pdf_path.name)


@router.post("/{proposal_id}/export/csv")
def export_csv(proposal_id: str, db: Session = Depends(get_db)):
    proposal = _get_proposal(proposal_id, db)
    out_path = EXPORT_DIR / f"{_slug(proposal.title)}-{proposal.proposal_id[:8]}.csv"
    export_formats.export_csv(proposal, out_path)
    _record_output(db, proposal, "csv", out_path)
    return FileResponse(out_path, filename=out_path.name)


@router.post("/{proposal_id}/export/json")
def export_json(proposal_id: str, db: Session = Depends(get_db)):
    proposal = _get_proposal(proposal_id, db)
    out_path = EXPORT_DIR / f"{_slug(proposal.title)}-{proposal.proposal_id[:8]}.json"
    export_formats.export_json(proposal, out_path)
    _record_output(db, proposal, "json", out_path)
    return FileResponse(out_path, filename=out_path.name)


@router.post("/{proposal_id}/export/excel")
def export_excel(proposal_id: str, db: Session = Depends(get_db)):
    proposal = _get_proposal(proposal_id, db)
    out_path = EXPORT_DIR / f"{_slug(proposal.title)}-{proposal.proposal_id[:8]}.xlsx"
    export_formats.export_excel(proposal, out_path)
    _record_output(db, proposal, "excel", out_path)
    return FileResponse(out_path, filename=out_path.name)


@router.post("/{proposal_id}/export/word")
def export_word(proposal_id: str, db: Session = Depends(get_db)):
    proposal = _get_proposal(proposal_id, db)
    out_path = EXPORT_DIR / f"{_slug(proposal.title)}-{proposal.proposal_id[:8]}.docx"
    export_formats.export_word(proposal, out_path)
    _record_output(db, proposal, "word", out_path)
    return FileResponse(out_path, filename=out_path.name)
