"""Model + seed tests, verifying the v1 → v2 gaps from spec §1 are actually
represented in stored data."""
from __future__ import annotations

from app.models import Building, Unit


def test_seeded_proposal_has_eight_units_across_five_buildings(db_session, seeded_proposal):
    assert len(seeded_proposal.selected_units) == 8
    building_ids = {u.building_id for u in seeded_proposal.selected_units}
    assert len(building_ids) == 5


def test_seeded_proposal_splits_into_two_regions(seeded_proposal):
    regions = {u.building.submarket for u in seeded_proposal.selected_units}
    assert regions == {"Houthavens Waterfront", "Houthavens Central"}


def test_seeded_proposal_has_one_flex_pricing_unit(seeded_proposal):
    flex_units = [u for u in seeded_proposal.selected_units if u.pricing_model == "per_desk_monthly"]
    assert len(flex_units) == 1
    unit = flex_units[0]
    assert unit.desk_count == 20
    assert unit.price_per_desk_month_eur == 980
    assert unit.space_provider == "Flexspace Central"


def test_gap_1_danzigerkade_splits_into_two_units(db_session, seeded_proposal):
    danzigerkade = db_session.query(Building).filter(Building.name == "Danzigerkade 13-G").one()
    units = db_session.query(Unit).filter(Unit.building_id == danzigerkade.building_id).all()
    assert len(units) == 2
    areas = sorted(u.available_area_m2 for u in units)
    assert areas == [150, 431]


def test_gap_1_moermanskkade_has_per_floor_units(db_session, seeded_proposal):
    moermanskkade = db_session.query(Building).filter(Building.name == "Moermanskkade 600").one()
    units = db_session.query(Unit).filter(Unit.building_id == moermanskkade.building_id).all()
    assert len(units) == 3
    floors = {u.floor for u in units}
    assert floors == {"1st floor", "2nd floor", "4th floor"}


def test_gap_2_rent_price_types_are_mixed(seeded_proposal):
    """§1 row 2: rent appears fixed, "from", and TBD across the shortlist —
    scoped to the direct-lease (per_sqm_annual) units, since rent_price_type
    is meaningless for the one flex/per-desk-monthly demo unit."""
    direct_lease_units = [u for u in seeded_proposal.selected_units if u.pricing_model == "per_sqm_annual"]
    price_types = {u.rent_price_type.value for u in direct_lease_units}
    assert price_types == {"fixed", "from", "tbd"}


def test_gap_3_neighbourhood_owns_shared_transit_fact(seeded_proposal):
    """§1 row 3: all 7 listings shared "Bus 48 nearby to Amsterdam Central" —
    it should be stored once on Neighbourhood, not duplicated per Unit."""
    neighbourhoods = {u.building.neighbourhood_id for u in seeded_proposal.selected_units}
    assert len(neighbourhoods) == 1
    nb = seeded_proposal.selected_units[0].building.neighbourhood
    assert any("Bus 48" in t["line"] for t in nb.public_transport)


def test_gap_4_addons_exist_for_parking_with_real_range(db_session, seeded_proposal):
    from app.models import AddOn

    all_addon_prices = [
        a.price
        for u in seeded_proposal.selected_units
        for a in db_session.query(AddOn).filter(AddOn.unit_id == u.unit_id).all()
        if "parking" in a.name.lower()
    ]
    assert min(all_addon_prices) == 618
    assert max(all_addon_prices) == 2750


def test_gap_6_contract_term_is_first_class_field(seeded_proposal):
    terms = {u.contract_term for u in seeded_proposal.selected_units}
    assert "5 years" in terms
    assert "Until Jan 2030 (negotiable)" in terms
    assert "TBD" in terms


def test_unit_is_price_ready_helper(seeded_proposal):
    """5 ready direct-lease units + 1 ready flex unit = 6; the 2 Moermanskkade
    TBD units remain not-ready."""
    ready_units = [u for u in seeded_proposal.selected_units if u.is_price_ready()]
    not_ready_units = [u for u in seeded_proposal.selected_units if not u.is_price_ready()]
    assert len(ready_units) == 6
    assert len(not_ready_units) == 2
