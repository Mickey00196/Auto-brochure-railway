"""Ingestion API (Steps 10–13).

POST /ingestion/jobs        create a job and start it in the background
GET  /ingestion/jobs        recent jobs
GET  /ingestion/jobs/{id}   one job's live status + summary (frontend polls this)
GET  /ingestion/sources     per-source health for the UI
GET  /ingestion/listings    ingested listings (optionally filter by needs_review)

The POST returns immediately with a job in `queued/running`; the actual scrape
runs in a background thread (ingestion_service). Nothing here waits on a scrape.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.ingestion import IngestionJob, SourceHealth
from app.models.listing import Listing
from app.schemas import (
    IngestionJobOut,
    IngestionRequest,
    ListingOut,
    SourceHealthOut,
)
from app.services import ingestion_service
from app.services.scraping import sources as source_registry

router = APIRouter(prefix="/ingestion", tags=["ingestion"])


@router.post("/jobs", response_model=IngestionJobOut, status_code=status.HTTP_202_ACCEPTED)
def create_job(payload: IngestionRequest, db: Session = Depends(get_db)) -> IngestionJob:
    # Validate requested sources against the registry; unknown names are an
    # error rather than a silent no-op so the UI can correct them.
    if payload.sources:
        known = {a.source_name for a in source_registry.all_adapters()}
        unknown = [s for s in payload.sources if s not in known]
        if unknown:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown source(s): {unknown}")

    job = IngestionJob(status="queued", params=payload.model_dump())
    db.add(job)
    db.commit()
    db.refresh(job)

    ingestion_service.start_job(job.job_id)
    return job


@router.get("/jobs", response_model=list[IngestionJobOut])
def list_jobs(limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    return db.query(IngestionJob).order_by(IngestionJob.created_at.desc()).limit(limit).all()


@router.get("/jobs/{job_id}", response_model=IngestionJobOut)
def get_job(job_id: str, db: Session = Depends(get_db)) -> IngestionJob:
    job = db.get(IngestionJob, job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    return job


@router.get("/sources", response_model=list[SourceHealthOut])
def list_sources(db: Session = Depends(get_db)):
    """Every registered source's health. Sources never run yet show as
    'unknown' rather than being hidden, so the UI lists the full roster."""
    existing = {h.source: h for h in db.query(SourceHealth).all()}
    out: list[SourceHealth] = []
    for adapter in source_registry.all_adapters():
        health = existing.get(adapter.source_name)
        if health is None:
            health = SourceHealth(
                source=adapter.source_name, display_name=adapter.display_name, status="unknown"
            )
        out.append(health)
    return out


@router.get("/listings", response_model=list[ListingOut])
def list_listings(
    needs_review: bool | None = None,
    source: str | None = None,
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(Listing)
    if needs_review is not None:
        q = q.filter(Listing.needs_review == needs_review)
    if source:
        q = q.filter(Listing.source == source)
    return q.order_by(Listing.last_seen_at.desc()).limit(limit).all()
