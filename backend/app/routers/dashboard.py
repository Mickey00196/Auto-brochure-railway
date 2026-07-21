"""§18 Dashboard.

Implements the widgets backed by data this app actually stores: imported
properties, draft/generated brochures, usage statistics, and the new
Data Completeness widget (§18) — a live count of tbd/missing critical
fields across active Proposals, built directly on the §8 QA pass.

"Recently scraped items", "recent searches" and "favourite properties" are
left as empty/zeroed placeholders with an explanatory note: they depend on
scrape-history and user-interaction logging that aren't part of this MVP's
data model (see README "What's stubbed").
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Building, Proposal, ProposalStatus, Unit
from app.services.qa import QASeverity, run_qa_pass

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("")
def get_dashboard(db: Session = Depends(get_db)):
    buildings = db.query(Building).all()
    units = db.query(Unit).all()
    proposals = db.query(Proposal).all()

    active_proposals = [p for p in proposals if p.status != ProposalStatus.CLOSED]
    blocking_issue_count = 0
    tbd_field_count = 0
    for proposal in active_proposals:
        report = run_qa_pass(db, proposal)
        for issue in report.issues:
            if issue.code in ("tbd_rent", "tbd_service_charge"):
                tbd_field_count += 1
            if issue.severity == QASeverity.BLOCKING:
                blocking_issue_count += 1

    generated_outputs = [o for p in proposals for o in (p.generated_outputs or [])]

    return {
        "imported_properties": {"buildings": len(buildings), "units": len(units)},
        "proposals_by_status": {
            status.value: sum(1 for p in proposals if p.status == status) for status in ProposalStatus
        },
        "generated_brochures": {
            "total": len(generated_outputs),
            "by_format": {
                fmt: sum(1 for o in generated_outputs if o.get("format") == fmt)
                for fmt in {o.get("format") for o in generated_outputs}
            },
        },
        "data_completeness": {
            "active_proposals_checked": len(active_proposals),
            "tbd_field_count": tbd_field_count,
            "blocking_qa_issue_count": blocking_issue_count,
        },
        "recently_scraped_items": [],
        "recent_searches": [],
        "favourite_properties": [],
        "_note": (
            "recently_scraped_items / recent_searches / favourite_properties are not yet backed by "
            "persisted history in this MVP — see README."
        ),
    }
