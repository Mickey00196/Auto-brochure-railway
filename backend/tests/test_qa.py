"""§8 QA pass tests, each tied to a concrete defect from the reference
brochure (§1)."""
from __future__ import annotations

from app.models import AddOn
from app.services.qa import (
    QASeverity,
    check_source_conflicts,
    check_tbd_headline_fields,
    detect_price_outliers,
    lint_copy,
    run_qa_pass,
)


def test_flags_service_charge_mismatch_between_sources():
    """Regression test for the exact bug class in §1 row 5: Danzigerkade
    13-G's overview table said €55 service charge; its own detail page said
    €60. Structurally impossible once data lives in a single Unit row, but
    this is a live risk during import/scraping (§7) where the "same" fact
    is pulled from two places on a source page before normalization.
    """
    raw_observations = {
        "service_charge_eur_per_m2_year": [("overview_table", 55), ("detail_page", 60)],
        "rent_eur_per_m2_year": [("overview_table", 243), ("detail_page", 243)],
    }
    issues = check_source_conflicts(raw_observations)
    assert len(issues) == 1
    assert issues[0].severity == QASeverity.BLOCKING
    assert issues[0].field == "service_charge_eur_per_m2_year"
    assert "55" in issues[0].message and "60" in issues[0].message


def test_no_conflict_when_sources_agree():
    raw_observations = {"rent_eur_per_m2_year": [("overview_table", 243), ("detail_page", 243)]}
    assert check_source_conflicts(raw_observations) == []


def test_unacknowledged_tbd_rent_is_blocking(seeded_proposal):
    units = seeded_proposal.selected_units
    # Scoped to direct-lease units: rent_price_type is meaningless for the
    # one flex/per-desk-monthly demo unit, which defaults to the same "tbd"
    # enum value without actually being unpriced (see check_tbd_headline_fields,
    # which branches on pricing_model for exactly this reason).
    tbd_units = [u for u in units if u.pricing_model == "per_sqm_annual" and u.rent_price_type == "tbd"]
    assert len(tbd_units) == 2  # §1 row 2: rent is TBD on 2 of 7 direct-lease listings

    issues = check_tbd_headline_fields(tbd_units)
    assert all(i.severity == QASeverity.BLOCKING for i in issues if i.code == "tbd_rent")


def test_acknowledged_tbd_downgrades_to_warning(seeded_proposal):
    units = seeded_proposal.selected_units
    tbd_unit = next(u for u in units if u.rent_price_type == "tbd")

    blocking_issues = check_tbd_headline_fields([tbd_unit])
    assert any(i.severity == QASeverity.BLOCKING for i in blocking_issues)

    acknowledged_issues = check_tbd_headline_fields([tbd_unit], acknowledged_unit_ids={tbd_unit.unit_id})
    assert all(i.severity == QASeverity.WARNING for i in acknowledged_issues)


def test_lint_copy_flags_missing_separator():
    """§8: the reference brochure had "High ceilingsLoft-style appearance" —
    a literal missing separator between two amenity phrases."""
    issues = lint_copy("High ceilingsLoft-style appearance")
    assert any(i.code == "missing_separator" for i in issues)


def test_lint_copy_clean_text_has_no_missing_separator_issue():
    issues = lint_copy("High ceilings, Loft-style appearance")
    assert not any(i.code == "missing_separator" for i in issues)


def test_lint_copy_flags_run_on_bullet():
    run_on = "spacious bright modern flexible turn key premium high end sustainable well located office suite"
    issues = lint_copy(run_on)
    assert any(i.code == "run_on_bullet" for i in issues)


def test_detect_price_outliers_flags_618_parking_space():
    """§1 row 4: parking ranged €618-€2,750; the €618 space sitting next to
    five others above €2,000 should be flagged for human review."""
    addons = [
        AddOn(unit_id="u1", name="Parking space", price=2400, price_unit="EUR/space/yr"),
        AddOn(unit_id="u2", name="Parking space", price=2200, price_unit="EUR/space/yr"),
        AddOn(unit_id="u3", name="Parking space", price=2750, price_unit="EUR/space/yr"),
        AddOn(unit_id="u4", name="Parking space", price=2100, price_unit="EUR/space/yr"),
        AddOn(unit_id="u5", name="Parking space", price=618, price_unit="EUR/space/yr"),
        AddOn(unit_id="u6", name="Parking space", price=2300, price_unit="EUR/space/yr"),
    ]
    issues = detect_price_outliers(addons)
    outlier_unit_ids = {i.unit_id for i in issues}
    assert "u5" in outlier_unit_ids


def test_detect_price_outliers_no_flags_for_uniform_prices():
    addons = [
        AddOn(unit_id="u1", name="Parking space", price=2000, price_unit="EUR/space/yr"),
        AddOn(unit_id="u2", name="Parking space", price=2050, price_unit="EUR/space/yr"),
        AddOn(unit_id="u3", name="Parking space", price=1980, price_unit="EUR/space/yr"),
    ]
    assert detect_price_outliers(addons) == []


def test_full_qa_pass_blocks_export_on_seeded_data(db_session, seeded_proposal):
    report = run_qa_pass(db_session, seeded_proposal)
    assert report.is_export_ready is False
    assert any(i.code == "tbd_rent" for i in report.issues)
    assert any(i.code == "price_outlier" for i in report.issues)


def test_full_qa_pass_export_ready_once_tbd_acknowledged(db_session, seeded_proposal):
    tbd_unit_ids = {u.unit_id for u in seeded_proposal.selected_units if u.rent_price_type == "tbd"}
    report = run_qa_pass(db_session, seeded_proposal, acknowledged_unit_ids=tbd_unit_ids)
    assert report.is_export_ready is True
