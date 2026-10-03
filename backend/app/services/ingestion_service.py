"""Ingestion orchestrator + background job runner.

One job = for each selected source: discover listing URLs → fetch → parse →
normalize → match to a building (dedup) → upsert the Listing, recording any
changed values as history → update counters, logs, and source health.

Access handling (Steps 6, 16-principle): transient outcomes (RATE_LIMITED,
TEMPORARY_ERROR) are retried with exponential backoff; a deliberate refusal
(ACCESS_DENIED, AUTH_REQUIRED) is NOT retried — the source is marked
temporarily unavailable and the job moves on to the next source. There is no
code path that tries to defeat a block.

Concurrency: runs in a daemon thread with its own DB session (Step 11 — no
Redis/Celery, just the simplest mechanism that fits the single Railway
service). Progress is committed as it goes so the polling API sees it live.
"""
from __future__ import annotations

import hashlib
import threading
import time
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.building import Building
from app.models.ingestion import IngestionJob, SourceHealth
from app.models.listing import Listing, ListingPriceHistory
from app.services.scraping.adapter import SearchParams, SourceAdapter
from app.services.scraping.deduplicator import match_building
from app.services.scraping.normalized import (
    RETRYABLE_STATUSES,
    AccessStatus,
    DiscoveryResult,
    FetchResult,
    NormalizedListing,
)
from app.services.scraping import sources as source_registry

_MAX_ATTEMPTS = 3
_BACKOFF_BASE_SECONDS = 2.0
# A source that reports it's refusing/needs-auth maps to this UI health status.
_UNAVAILABLE_STATUSES = {AccessStatus.ACCESS_DENIED, AccessStatus.AUTH_REQUIRED}


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── public entrypoint ────────────────────────────────────────────────────
def start_job(job_id: str) -> None:
    """Launch the runner for an already-persisted IngestionJob in a daemon
    thread and return immediately (the HTTP request does not wait)."""
    threading.Thread(target=_run_job, args=(job_id,), daemon=True).start()


# ── runner ───────────────────────────────────────────────────────────────
def _run_job(job_id: str) -> None:
    db = SessionLocal()
    try:
        job = db.get(IngestionJob, job_id)
        if job is None:
            return
        job.status = "running"
        job.started_at = _now()
        db.commit()

        params = job.params or {}
        search = SearchParams(
            city=params.get("city"),
            property_type=params.get("property_type", "office"),
            min_area_sqm=params.get("min_area_sqm"),
            max_area_sqm=params.get("max_area_sqm"),
            max_results=params.get("max_results", 100),
        )
        adapters = source_registry.get_adapters(params.get("sources"))

        _log(db, job, "info", f"Starting ingestion for sources: {[a.source_name for a in adapters]}")
        for adapter in adapters:
            _run_source(db, job, adapter, search)

        job.status = "completed"
        job.finished_at = _now()
        _log(db, job, "info", "Job completed")
        db.commit()
    except Exception as e:  # never let a worker thread die silently
        db.rollback()
        job = db.get(IngestionJob, job_id)
        if job is not None:
            job.status = "failed"
            job.error = str(e)
            job.finished_at = _now()
            _log(db, job, "error", f"Job failed: {e}")
            db.commit()
    finally:
        db.close()


def _run_source(db: Session, job: IngestionJob, adapter: SourceAdapter, search: SearchParams) -> None:
    health = _get_health(db, adapter)
    health.last_attempt = _now()

    _log(db, job, "info", f"[{adapter.source_name}] Search: {search.city} / {search.property_type} / "
                          f"{search.min_area_sqm}-{search.max_area_sqm} sqm")

    discovery = _with_retry(lambda: adapter.discover_listings(search))
    if discovery.status in _UNAVAILABLE_STATUSES:
        health.status = "unavailable"
        health.last_error = f"{discovery.status.value}: {discovery.detail or ''}".strip()
        _log(db, job, "warn", f"[{adapter.source_name}] unavailable ({discovery.status.value}) — skipping. "
                              f"{discovery.detail or ''}")
        db.commit()
        return
    if discovery.status is AccessStatus.NO_RESULTS:
        health.status = "healthy"
        _log(db, job, "info", f"[{adapter.source_name}] no results")
        db.commit()
        return
    if discovery.status is not AccessStatus.SUCCESS:
        health.status = "degraded"
        health.last_error = discovery.status.value
        _log(db, job, "warn", f"[{adapter.source_name}] discovery error: {discovery.status.value}")
        db.commit()
        return

    urls = discovery.listing_urls
    job.discovered += len(urls)
    job.progress_total += len(urls)
    _log(db, job, "info", f"[{adapter.source_name}] Discovered {len(urls)} listing URLs")
    db.commit()

    source_count = 0
    for url in urls:
        fetched = _with_retry(lambda: adapter.fetch_listing(url))
        if fetched.status in _UNAVAILABLE_STATUSES:
            # A block partway through: stop hitting this source, mark it, move on.
            health.status = "unavailable"
            health.last_error = fetched.status.value
            _log(db, job, "warn", f"[{adapter.source_name}] blocked mid-run ({fetched.status.value}) — "
                                  f"stopping this source")
            db.commit()
            return
        if fetched.status is not AccessStatus.SUCCESS:
            job.failed += 1
            job.processed += 1
            job.progress_current += 1
            _log(db, job, "warn", f"[{adapter.source_name}] fetch {fetched.status.value}: {url}")
            db.commit()
            continue

        normalized = adapter.parse_listing(fetched)
        if normalized is None:
            job.failed += 1
            job.processed += 1
            job.progress_current += 1
            _log(db, job, "warn", f"[{adapter.source_name}] parse failed: {url}")
            db.commit()
            continue

        outcome = _upsert_listing(db, normalized)
        source_count += 1
        job.processed += 1
        job.progress_current += 1
        setattr(job, outcome, getattr(job, outcome) + 1)  # created|updated|unchanged
        if outcome == "created" and normalized.building_name:
            pass
        db.commit()

    health.status = "healthy"
    health.last_successful_run = _now()
    health.last_error = None
    health.number_of_listings = (
        db.query(Listing).filter(Listing.source == adapter.source_name).count()
    )
    _log(db, job, "info", f"[{adapter.source_name}] processed {source_count} listings")
    db.commit()


# ── retry with backoff (transient only) ──────────────────────────────────
def _with_retry(call):
    """Retry `call` (returning a Discovery/FetchResult) only while it reports a
    genuinely transient status. A refusal is returned immediately — never
    retried."""
    result = call()
    attempt = 1
    while result.status in RETRYABLE_STATUSES and attempt < _MAX_ATTEMPTS:
        time.sleep(_BACKOFF_BASE_SECONDS * (2 ** (attempt - 1)))
        result = call()
        attempt += 1
    return result


# ── upsert + change history (Steps 7, 8) ─────────────────────────────────
def _content_hash(n: NormalizedListing) -> str:
    parts = [n.asking_rent, n.service_charge, n.available_area_sqm, n.floor,
             n.availability_date, n.description]
    return hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()


def _upsert_listing(db: Session, n: NormalizedListing) -> str:
    """Create or update the Listing for this scrape. Returns one of
    "created" | "updated" | "unchanged"."""
    existing = _find_existing(db, n)
    new_hash = _content_hash(n)

    if existing is None:
        match = match_building(db, n)
        building = match.building or _maybe_create_building(db, n, match.confidence)
        listing = Listing(
            source=n.source,
            source_listing_id=n.source_listing_id,
            source_url=n.source_url,
            building_id=building.building_id if building else None,
            match_confidence=match.confidence,
            needs_review=match.needs_review,
            content_hash=new_hash,
            **_listing_columns(n),
        )
        db.add(listing)
        db.flush()
        db.add(ListingPriceHistory(
            listing_id=listing.listing_id, asking_rent=n.asking_rent,
            service_charge=n.service_charge, available_area_sqm=n.available_area_sqm,
            status="active", change_type="created",
        ))
        return "created"

    existing.last_seen_at = _now()
    existing.last_checked_at = _now()
    if existing.content_hash == new_hash:
        return "unchanged"

    # Record what changed before overwriting (Step 7).
    change_type = "rent" if existing.asking_rent != n.asking_rent else (
        "area" if existing.available_area_sqm != n.available_area_sqm else "other")
    db.add(ListingPriceHistory(
        listing_id=existing.listing_id, asking_rent=n.asking_rent,
        service_charge=n.service_charge, available_area_sqm=n.available_area_sqm,
        status="active", change_type=change_type,
    ))
    for key, value in _listing_columns(n).items():
        setattr(existing, key, value)
    existing.content_hash = new_hash
    existing.scraped_at = n.scraped_at or _now()
    return "updated"


def _find_existing(db: Session, n: NormalizedListing) -> Listing | None:
    q = db.query(Listing).filter(Listing.source == n.source)
    if n.source_listing_id:
        found = q.filter(Listing.source_listing_id == n.source_listing_id).first()
        if found:
            return found
    return q.filter(Listing.source_url == n.source_url).first()


def _listing_columns(n: NormalizedListing) -> dict:
    """The NormalizedListing fields that map 1:1 onto Listing columns (the
    identity/metadata columns are set explicitly by the caller)."""
    return {
        "building_name": n.building_name, "address": n.address, "street": n.street,
        "house_number": n.house_number, "postal_code": n.postal_code, "city": n.city,
        "latitude": n.latitude, "longitude": n.longitude,
        "construction_year": n.construction_year, "energy_label": n.energy_label,
        "available_area_sqm": n.available_area_sqm, "min_area_sqm": n.min_area_sqm,
        "max_area_sqm": n.max_area_sqm, "floor": n.floor, "availability_date": n.availability_date,
        "asking_rent": n.asking_rent, "asking_rent_unit": n.asking_rent_unit,
        "asking_rent_period": n.asking_rent_period, "service_charge": n.service_charge,
        "service_charge_unit": n.service_charge_unit, "parking_available": n.parking_available,
        "parking_spaces": n.parking_spaces, "parking_price": n.parking_price,
        "title": n.title, "description": n.description, "amenities": n.amenities,
        "image_urls": n.image_urls, "floorplan_urls": n.floorplan_urls,
        "broker_name": n.broker_name, "broker_phone": n.broker_phone,
        "broker_email": n.broker_email, "broker_url": n.broker_url,
    }


def _maybe_create_building(db: Session, n: NormalizedListing, confidence: str) -> Building | None:
    """When no existing building matched and we have a real address, create one
    so the listing is visible in the app's existing Buildings UI. A low-
    confidence *match* never lands here (it links + flags instead), so this
    doesn't merge — it only ever creates a genuinely new building."""
    if confidence != "none" or not (n.street and n.city):
        return None
    building = Building(
        name=n.building_name or n.address or f"{n.street} {n.house_number or ''}".strip(),
        address=n.address or f"{n.street} {n.house_number or ''}".strip(),
        postal_code=n.postal_code,
        city=n.city,
        energy_label=n.energy_label,
        year_built=n.construction_year,
        description=n.description,
        photos=n.image_urls or [],
        source_url=n.source_url,
        building_amenities=n.amenities or [],
    )
    db.add(building)
    db.flush()
    return building


# ── health + logging ─────────────────────────────────────────────────────
def _get_health(db: Session, adapter: SourceAdapter) -> SourceHealth:
    health = db.get(SourceHealth, adapter.source_name)
    if health is None:
        health = SourceHealth(source=adapter.source_name, display_name=adapter.display_name)
        db.add(health)
        db.flush()
    health.display_name = adapter.display_name
    return health


def _log(db: Session, job: IngestionJob, level: str, message: str) -> None:
    """Append a structured log line to the job and mirror it to stdout. Never
    logs credentials/keys/cookies — callers pass human messages only."""
    entry = {"level": level, "msg": message, "ts": _now().isoformat()}
    job.logs = (job.logs or []) + [entry]
    print(f"[{level.upper()}] {message}", flush=True)
