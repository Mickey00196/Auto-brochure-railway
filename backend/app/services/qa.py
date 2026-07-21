"""§8 AI Data Normalization & Data QA.

Runs before any export (§24 quality requirement). Implements four checks,
each traced to a concrete defect found in the reference brochure (§1):

1. Single-source-of-truth conflicts — the reference PDF's overview table
   said €55 service charge for Danzigerkade 13-G; that unit's own detail
   page said €60 (§1 row 5). Our schema makes this structurally impossible
   for internally-stored data (one Unit row, one field, read by both
   overview and detail renderers — §13). It's still a live risk during
   *import*: a scraper (§7) or CSV/manual entry can pull the "same" fact
   from two places on a source page with two different values before it
   ever reaches a Unit row. `check_source_conflicts` catches that at
   ingestion time, operating on the raw multi-source extraction rather than
   the normalized Unit.
2. Unacknowledged TBD on a headline field — rent or service charge must not
   ship on an export without explicit human sign-off (§8, §24).
3. Copy linting — the reference brochure had a literal missing-separator
   slip ("High ceilingsLoft-style appearance", §8). `lint_copy` flags
   lowercase-directly-followed-by-uppercase collisions and overlong,
   unpunctuated bullet run-ons.
4. Statistical outliers — parking in the source ranged €618-€2,750/year;
   the €618 space sitting next to five others above €2,000 is exactly the
   kind of entry that should get a human's eyes before publishing (§1 row 4).
"""
from __future__ import annotations

import re
import statistics
from dataclasses import dataclass, field
from enum import Enum

from sqlalchemy.orm import Session

from app.config import OUTLIER_STD_DEV_THRESHOLD
from app.models import AddOn, Proposal, Unit


class QASeverity(str, Enum):
    BLOCKING = "blocking"
    WARNING = "warning"
    INFO = "info"


@dataclass
class QAIssue:
    severity: QASeverity
    code: str
    message: str
    unit_id: str | None = None
    field: str | None = None


@dataclass
class QAReport:
    issues: list[QAIssue] = field(default_factory=list)

    @property
    def is_export_ready(self) -> bool:
        return not any(issue.severity == QASeverity.BLOCKING for issue in self.issues)

    def to_dict(self) -> dict:
        return {
            "is_export_ready": self.is_export_ready,
            "issue_count": len(self.issues),
            "blocking_count": sum(1 for i in self.issues if i.severity == QASeverity.BLOCKING),
            "warning_count": sum(1 for i in self.issues if i.severity == QASeverity.WARNING),
            "issues": [
                {
                    "severity": i.severity.value,
                    "code": i.code,
                    "message": i.message,
                    "unit_id": i.unit_id,
                    "field": i.field,
                }
                for i in self.issues
            ],
        }


# ─────────────────────────────────────── 1. Single source of truth ───────────────────────────────────────


def check_source_conflicts(raw_field_observations: dict[str, list[tuple[str, float | str]]]) -> list[QAIssue]:
    """Given {field_name: [(source_location, value), ...]} extracted from a single
    listing (e.g. overview table vs. detail page during scraping/import), flag any
    field where two sources disagree — the exact shape of the €55/€60 bug (§1 row 5).
    """
    issues: list[QAIssue] = []
    for field_name, observations in raw_field_observations.items():
        distinct_values = {value for _source, value in observations}
        if len(distinct_values) > 1:
            sources_desc = ", ".join(f"{source}={value!r}" for source, value in observations)
            issues.append(
                QAIssue(
                    severity=QASeverity.BLOCKING,
                    code="source_conflict",
                    message=(
                        f"Field '{field_name}' has conflicting values across sources before it "
                        f"could be normalized to a single Unit record: {sources_desc}. "
                        "Resolve to one source of truth before this becomes a stored fact."
                    ),
                    field=field_name,
                )
            )
    return issues


# ─────────────────────────────────────── 2. TBD headline fields ───────────────────────────────────────


def check_tbd_headline_fields(units: list[Unit], acknowledged_unit_ids: set[str] | None = None) -> list[QAIssue]:
    """Branches on `Unit.pricing_model`: a flex/per-desk-monthly unit's
    headline price lives in `price_per_desk_month_eur`, not
    `rent_eur_per_m2_year` — checking the wrong field would either falsely
    flag a fully-priced flex listing or silently miss a genuinely unpriced
    one, depending on that field's unrelated default."""
    acknowledged_unit_ids = acknowledged_unit_ids or set()
    issues: list[QAIssue] = []
    for unit in units:
        severity = QASeverity.WARNING if unit.unit_id in acknowledged_unit_ids else QASeverity.BLOCKING

        if unit.pricing_model == "per_desk_monthly":
            if unit.price_per_desk_month_eur is None or unit.desk_count is None:
                issues.append(
                    QAIssue(
                        severity=severity,
                        code="tbd_rent",
                        message=(
                            f"Unit {unit.unit_id} ({unit.floor or 'unspecified floor'}) has no per-desk "
                            "monthly price. Renders cleanly as 'TBD' but must not ship on export without "
                            "sign-off."
                        ),
                        unit_id=unit.unit_id,
                        field="price_per_desk_month_eur",
                    )
                )
            continue

        if unit.rent_price_type == "tbd" or unit.rent_eur_per_m2_year is None:
            issues.append(
                QAIssue(
                    severity=severity,
                    code="tbd_rent",
                    message=(
                        f"Unit {unit.unit_id} ({unit.floor or 'unspecified floor'}) has rent=TBD. "
                        "Renders cleanly as 'TBD' but must not ship on export without sign-off."
                    ),
                    unit_id=unit.unit_id,
                    field="rent_eur_per_m2_year",
                )
            )
        if unit.service_charge_price_type == "tbd" or unit.service_charge_eur_per_m2_year is None:
            issues.append(
                QAIssue(
                    severity=severity,
                    code="tbd_service_charge",
                    message=(
                        f"Unit {unit.unit_id} ({unit.floor or 'unspecified floor'}) has service "
                        "charge=TBD. Renders cleanly as 'TBD' but must not ship on export without "
                        "sign-off."
                    ),
                    unit_id=unit.unit_id,
                    field="service_charge_eur_per_m2_year",
                )
            )
    return issues


# ─────────────────────────────────────── 3. Copy linting ───────────────────────────────────────

# Catches "ceilingsLoft" (lowercase → uppercase with no separator).
_MISSING_SEPARATOR_RE = re.compile(r"[a-z][A-Z]")
_MAX_BULLET_WORDS_WITHOUT_PUNCTUATION = 12


def lint_copy(text: str, *, unit_id: str | None = None, field_name: str | None = None) -> list[QAIssue]:
    issues: list[QAIssue] = []
    if not text:
        return issues

    for match in _MISSING_SEPARATOR_RE.finditer(text):
        issues.append(
            QAIssue(
                severity=QASeverity.WARNING,
                code="missing_separator",
                message=(
                    f"Possible missing separator near {text[max(0, match.start() - 12):match.end() + 12]!r} "
                    f"in {field_name or 'text'!s}."
                ),
                unit_id=unit_id,
                field=field_name,
            )
        )

    words = text.split()
    has_punctuation = any(ch in text for ch in ",.;:")
    if len(words) > _MAX_BULLET_WORDS_WITHOUT_PUNCTUATION and not has_punctuation:
        issues.append(
            QAIssue(
                severity=QASeverity.WARNING,
                code="run_on_bullet",
                message=f"Bullet item looks like a run-on ({len(words)} words, no punctuation): {text!r}",
                unit_id=unit_id,
                field=field_name,
            )
        )
    return issues


def lint_unit_copy(unit: Unit) -> list[QAIssue]:
    issues: list[QAIssue] = []
    for amenity in unit.unit_amenities or []:
        issues.extend(lint_copy(amenity, unit_id=unit.unit_id, field_name="unit_amenities"))
    return issues


# ─────────────────────────────────────── 4. Statistical outliers ───────────────────────────────────────


def detect_price_outliers(
    addons: list[AddOn], *, threshold_std_dev: float = OUTLIER_STD_DEV_THRESHOLD
) -> list[QAIssue]:
    """Group AddOns by name and flag any price more than `threshold_std_dev`
    standard deviations from the group mean — e.g. the €618 parking space
    sitting next to five others above €2,000 (§1 row 4).
    """
    issues: list[QAIssue] = []
    groups: dict[str, list[AddOn]] = {}
    for addon in addons:
        groups.setdefault(addon.name, []).append(addon)

    for name, group in groups.items():
        prices = [a.price for a in group]
        if len(prices) < 3:
            continue  # not enough data points to call anything an outlier
        mean = statistics.mean(prices)
        stdev = statistics.pstdev(prices)
        if stdev == 0:
            continue
        for addon in group:
            z = (addon.price - mean) / stdev
            if abs(z) >= threshold_std_dev:
                issues.append(
                    QAIssue(
                        severity=QASeverity.WARNING,
                        code="price_outlier",
                        message=(
                            f"'{name}' price {addon.price:,.0f} ({addon.price_unit}) is "
                            f"{abs(z):.1f} std dev from the group mean of {mean:,.0f} across "
                            f"{len(prices)} listings — flag for human review before publishing."
                        ),
                        unit_id=addon.unit_id,
                        field="price",
                    )
                )
    return issues


# ─────────────────────────────────────── Orchestration ───────────────────────────────────────


def run_qa_pass(
    db: Session, proposal: Proposal, *, acknowledged_unit_ids: set[str] | None = None
) -> QAReport:
    report = QAReport()
    units = proposal.selected_units

    report.issues.extend(check_tbd_headline_fields(units, acknowledged_unit_ids))

    for unit in units:
        report.issues.extend(lint_unit_copy(unit))

    all_addons: list[AddOn] = []
    for unit in units:
        all_addons.extend(db.query(AddOn).filter(AddOn.unit_id == unit.unit_id).all())
        all_addons.extend(db.query(AddOn).filter(AddOn.building_id == unit.building_id).all())
    report.issues.extend(detect_price_outliers(all_addons))

    return report
