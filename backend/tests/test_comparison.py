"""§16 Comparison Generator tests."""
from __future__ import annotations

from app.services.comparison import build_comparison_row, build_comparison_table


def test_all_in_rate_and_annual_cost_computed(seeded_proposal):
    danzigerkade_a = next(u for u in seeded_proposal.selected_units if u.available_area_m2 == 431)
    row = build_comparison_row(danzigerkade_a)
    assert row.all_in_rate_eur_per_m2_year == 303  # 243 rent + 60 service charge
    assert row.estimated_annual_cost_eur == 303 * 431
    assert row.is_tbd is False


def test_tbd_unit_has_no_all_in_rate(seeded_proposal):
    tbd_unit = next(
        u
        for u in seeded_proposal.selected_units
        if u.pricing_model == "per_sqm_annual" and u.rent_price_type == "tbd" and u.service_charge_price_type == "tbd"
    )
    row = build_comparison_row(tbd_unit)
    assert row.is_tbd is True
    assert row.all_in_rate_eur_per_m2_year is None
    assert row.estimated_annual_cost_eur is None


def test_default_sort_ready_rows_ascending_then_tbd_last(seeded_proposal):
    """Ready per_sqm_annual rows first (ascending all-in rate), then the
    ready per_desk_monthly row, then genuinely TBD rows last — the two
    pricing models are never mixed in the same rank (see comparison.py's
    _sort_key)."""
    rows = build_comparison_table(seeded_proposal.selected_units)
    ready_rows = [r for r in rows if not r.is_tbd]
    tbd_rows = [r for r in rows if r.is_tbd]

    # All ready rows precede all TBD rows.
    assert rows[: len(ready_rows)] == ready_rows
    assert len(tbd_rows) == 2  # §1 row 2: 2 of 8 listings are TBD

    ready_per_sqm = [r for r in ready_rows if r.pricing_model == "per_sqm_annual"]
    ready_per_desk = [r for r in ready_rows if r.pricing_model == "per_desk_monthly"]
    assert len(ready_per_sqm) == 5
    assert len(ready_per_desk) == 1

    # per_sqm_annual rows come first, sorted ascending by all-in rate...
    assert ready_rows[: len(ready_per_sqm)] == ready_per_sqm
    rates = [r.all_in_rate_eur_per_m2_year for r in ready_per_sqm]
    assert rates == sorted(rates)
    # ...then the per_desk_monthly row.
    assert ready_rows[len(ready_per_sqm) :] == ready_per_desk


def test_comparison_row_reflects_parking_price_range(seeded_proposal):
    danzigerkade_a = next(u for u in seeded_proposal.selected_units if u.available_area_m2 == 431)
    row = build_comparison_row(danzigerkade_a, addons=danzigerkade_a.addons)
    assert row.parking_price_range == "€2,400 / space / year"
