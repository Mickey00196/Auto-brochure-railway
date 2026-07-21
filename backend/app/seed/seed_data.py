"""Seed data grounded in a real 7-listing direct-lease brochure (§1's gap
table) plus a real "Market Inventory" flex-office template — see
tests/test_seed_and_models.py and the top-level README for how each gap maps
to a field.

8 leasable units across 5 buildings, split into 2 regions to exercise the
Per Region grouping:

- "Houthavens Waterfront": Danzigerkade 13-G (splits into two independent
  units — gap #1) and Moermanskkade 600 (separately available 1st/2nd/4th
  floor units — gap #1).
- "Houthavens Central": Keilestraat 5, Spaarndammerdijk 202, and
  Prinseneiland 12 — the last priced per-desk/month (`PricingModel.
  PER_DESK_MONTHLY`) rather than per-m²/year, to demonstrate the
  flex/serviced-office pricing shape alongside the original direct-lease one.

Also reproduces gap #2 (fixed / from / tbd rent all present), gap #3 (shared
neighbourhood transit fact instead of repeated per-unit text), gap #4
(parking AddOns spanning the real €618–€2,750 range, including the €618
outlier), and gap #6 (contract_term populated with real-brochure phrasing).

Gap #5 (the €55 vs €60 service-charge inconsistency) is deliberately NOT
reproduced here — seed data represents the *post-QA* clean state. The bug
class itself is covered by a dedicated regression test in
tests/test_qa.py::test_flags_service_charge_mismatch_between_sources.

Names/firms below (client, brokers, buildings, "Flexspace Central") are all
fictional — no real company's brochure, staff, or contact details are
reproduced, including in the closing Project Team page.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import AddOn, Building, Client, Neighbourhood, Proposal, ProposalUnit, Unit
from app.models.enums import (
    DeliveryCondition,
    PricingModel,
    ProposalStatus,
    RentPriceType,
    ServiceChargePriceType,
)


def seed_database(db: Session) -> Proposal:
    """Idempotent-ish seed: wipes and repopulates the demo dataset. Returns the seeded Proposal."""

    for model in (ProposalUnit, Proposal, AddOn, Unit, Building, Client, Neighbourhood):
        db.query(model).delete()
    db.commit()

    houthavens = Neighbourhood(
        name="Houthavens",
        city="Amsterdam",
        description=(
            "Former harbour district turned waterfront business quarter on the western edge of "
            "Amsterdam, minutes from the city centre with direct water frontage and rapid transit "
            "access."
        ),
        public_transport=[
            {"line": "Bus 48", "station": "Amsterdam Centraal", "walking_time_min": 12},
            {"line": "Bus 22", "station": "Houthavens", "walking_time_min": 4},
        ],
        nearby_amenities=[
            {"category": "restaurant", "name": "Pontsteiger Waterfront Grill", "walking_time_min": 5},
            {"category": "hotel", "name": "Silo Hotel Houthavens", "walking_time_min": 7},
            {"category": "gym", "name": "Houthavens Fitness Club", "walking_time_min": 6},
        ],
    )
    db.add(houthavens)
    db.flush()

    perry_ellis = Client(
        company_name="Perry Ellis",
        industry="Apparel & Retail",
        contacts=[
            {
                "name": "Perry Ellis Corporate Real Estate",
                "role": "Director of Real Estate",
                "email": "realestate@perryellis.example",
            }
        ],
        search_brief={
            "location": "Amsterdam",
            "budget_eur_per_m2_year": 320,
            "size_m2_min": 150,
            "size_m2_max": 650,
            "must_haves": ["near_public_transport", "turn_key_preferred"],
        },
    )
    db.add(perry_ellis)
    db.flush()

    # ── Building 1: Danzigerkade 13-G — one building, two independent units (gap #1) ──
    danzigerkade = Building(
        name="Danzigerkade 13-G",
        address="Danzigerkade 13-G",
        postal_code="1013 AP",
        city="Amsterdam",
        country="Netherlands",
        latitude=52.3891,
        longitude=4.8776,
        neighbourhood_id=houthavens.neighbourhood_id,
        submarket="Houthavens Waterfront",
        building_type="Turn-key Office",
        year_built=2019,
        energy_label="A",
        breeam_rating="Excellent",
        total_building_area_m2=581,
        accessibility_note="A10 3 km",
        airport_note="Schiphol 15 km",
        building_amenities=["Roof terrace", "Bicycle storage", "24/7 access", "On-site concierge"],
        description=(
            "A striking waterfront office building combining exposed structural detailing with "
            "premium turn-key finishes, set directly on the Houthavens quay."
        ),
        photos=["danzigerkade-exterior.jpg", "danzigerkade-lobby.jpg"],
        source_url="https://example-brokerage.test/listings/danzigerkade-13g",
    )
    db.add(danzigerkade)
    db.flush()

    danzigerkade_unit_a = Unit(
        building_id=danzigerkade.building_id,
        floor="Ground & 1st floor",
        available_area_m2=431,
        delivery_condition=DeliveryCondition.TURN_KEY,
        rent_price_type=RentPriceType.FIXED,
        rent_eur_per_m2_year=243,
        service_charge_price_type=ServiceChargePriceType.FIXED,
        service_charge_eur_per_m2_year=60,
        contract_term="5 years",
        contract_term_years=5,
        availability="Available per direct",
        unit_amenities=["LED lighting", "Air conditioning", "High ceilings", "Loft-style appearance"],
        photos=["danzigerkade-unit-a-1.jpg"],
        floorplan_url="danzigerkade-unit-a-floorplan.pdf",
    )
    danzigerkade_unit_b = Unit(
        building_id=danzigerkade.building_id,
        floor="2nd floor",
        available_area_m2=150,
        delivery_condition=DeliveryCondition.SHELL_AND_CORE,
        rent_price_type=RentPriceType.FROM,
        rent_eur_per_m2_year=245,
        service_charge_price_type=ServiceChargePriceType.FIXED,
        service_charge_eur_per_m2_year=60,
        contract_term="Until Jan 2030 (negotiable)",
        contract_term_years=None,
        availability="Available per direct",
        unit_amenities=["LED lighting", "Furniture optional", "Pantry"],
        photos=["danzigerkade-unit-b-1.jpg"],
        floorplan_url="danzigerkade-unit-b-floorplan.pdf",
    )
    db.add_all([danzigerkade_unit_a, danzigerkade_unit_b])
    db.flush()

    db.add_all(
        [
            AddOn(
                unit_id=danzigerkade_unit_a.unit_id,
                name="Covered parking space",
                price=2400,
                price_unit="EUR / space / year",
                quantity_available=4,
            ),
            AddOn(
                unit_id=danzigerkade_unit_b.unit_id,
                name="Covered parking space",
                price=2200,
                price_unit="EUR / space / year",
                quantity_available=2,
            ),
        ]
    )

    # ── Building 2: Moermanskkade 600 — separately available units on 1st, 2nd, 4th floor (gap #1) ──
    moermanskkade = Building(
        name="Moermanskkade 600",
        address="Moermanskkade 600",
        postal_code="1013 BC",
        city="Amsterdam",
        country="Netherlands",
        latitude=52.3945,
        longitude=4.8838,
        neighbourhood_id=houthavens.neighbourhood_id,
        submarket="Houthavens Waterfront",
        building_type="High-end Office",
        year_built=2021,
        energy_label="A+",
        breeam_rating="Very Good",
        total_building_area_m2=1337,
        accessibility_note="A10 2 km",
        airport_note="Schiphol 14 km",
        building_amenities=["Restaurant", "Gym & spa", "Auditorium", "Bar"],
        description=(
            "A landmark multi-tenant office building offering flexible, independently leasable "
            "floors with panoramic harbour views and a full amenity programme."
        ),
        photos=["moermanskkade-exterior.jpg"],
        source_url="https://example-brokerage.test/listings/moermanskkade-600",
    )
    db.add(moermanskkade)
    db.flush()

    moermanskkade_1st = Unit(
        building_id=moermanskkade.building_id,
        floor="1st floor",
        available_area_m2=620,
        delivery_condition=DeliveryCondition.SHELL_AND_CORE_PLUS,
        rent_price_type=RentPriceType.FROM,
        rent_eur_per_m2_year=240,
        service_charge_price_type=ServiceChargePriceType.FIXED,
        service_charge_eur_per_m2_year=58,
        contract_term="From 1 year",
        contract_term_years=1,
        availability="Available per direct",
        unit_amenities=["Raised floors", "A/C", "Harbour view"],
        photos=["moermanskkade-1st-1.jpg"],
        floorplan_url="moermanskkade-1st-floorplan.pdf",
    )
    moermanskkade_2nd = Unit(
        building_id=moermanskkade.building_id,
        floor="2nd floor",
        available_area_m2=410,
        delivery_condition=DeliveryCondition.MIXED,
        rent_price_type=RentPriceType.TBD,
        rent_eur_per_m2_year=None,
        service_charge_price_type=ServiceChargePriceType.FIXED,
        service_charge_eur_per_m2_year=58,
        contract_term="In consultation",
        contract_term_years=None,
        availability="Q4 2026",
        unit_amenities=["Raised floors", "A/C"],
        photos=["moermanskkade-2nd-1.jpg"],
        floorplan_url="moermanskkade-2nd-floorplan.pdf",
    )
    moermanskkade_4th = Unit(
        building_id=moermanskkade.building_id,
        floor="4th floor",
        available_area_m2=307,
        min_divisible_area_m2=75,
        delivery_condition=DeliveryCondition.SHELL_AND_CORE,
        rent_price_type=RentPriceType.TBD,
        rent_eur_per_m2_year=None,
        service_charge_price_type=ServiceChargePriceType.TBD,
        service_charge_eur_per_m2_year=None,
        contract_term="TBD",
        contract_term_years=None,
        availability="TBD",
        unit_amenities=["Raised floors"],
        photos=["moermanskkade-4th-1.jpg"],
        floorplan_url="moermanskkade-4th-floorplan.pdf",
    )
    db.add_all([moermanskkade_1st, moermanskkade_2nd, moermanskkade_4th])
    db.flush()

    db.add_all(
        [
            AddOn(
                unit_id=moermanskkade_1st.unit_id,
                name="Parking space",
                price=2750,
                price_unit="EUR / space / year",
                quantity_available=5,
            ),
            AddOn(
                unit_id=moermanskkade_2nd.unit_id,
                name="Parking space",
                price=2100,
                price_unit="EUR / space / year",
                quantity_available=3,
            ),
            AddOn(
                unit_id=moermanskkade_4th.unit_id,
                name="Parking space",
                price=618,
                price_unit="EUR / space / year",
                quantity_available=2,
            ),
        ]
    )

    # ── Building 3: Keilestraat 5 — single unit ──
    keilestraat = Building(
        name="Keilestraat 5",
        address="Keilestraat 5",
        postal_code="1014 BE",
        city="Amsterdam",
        country="Netherlands",
        latitude=52.3901,
        longitude=4.8802,
        neighbourhood_id=houthavens.neighbourhood_id,
        submarket="Houthavens Central",
        building_type="Turn-key Office",
        year_built=2018,
        energy_label="A",
        total_building_area_m2=350,
        accessibility_note="A10 3 km",
        airport_note="Schiphol 16 km",
        building_amenities=["Bicycle storage", "24/7 access"],
        description="A compact, fully-fitted turn-key office on the ground floor of a converted warehouse.",
        photos=["keilestraat-exterior.jpg"],
        source_url="https://example-brokerage.test/listings/keilestraat-5",
    )
    db.add(keilestraat)
    db.flush()

    keilestraat_unit = Unit(
        building_id=keilestraat.building_id,
        floor="Ground floor",
        available_area_m2=350,
        delivery_condition=DeliveryCondition.TURN_KEY,
        rent_price_type=RentPriceType.FIXED,
        rent_eur_per_m2_year=250,
        service_charge_price_type=ServiceChargePriceType.FIXED,
        service_charge_eur_per_m2_year=62,
        contract_term="5 years",
        contract_term_years=5,
        availability="Available per direct",
        unit_amenities=["LED lighting", "Furnished", "Pantry"],
        photos=["keilestraat-unit-1.jpg"],
        floorplan_url="keilestraat-floorplan.pdf",
    )
    db.add(keilestraat_unit)
    db.flush()

    db.add(
        AddOn(
            unit_id=keilestraat_unit.unit_id,
            name="Parking space",
            price=2300,
            price_unit="EUR / space / year",
            quantity_available=6,
        )
    )

    # ── Building 4: Spaarndammerdijk 202 — single unit, building-level AddOn ──
    spaarndammerdijk = Building(
        name="Spaarndammerdijk 202",
        address="Spaarndammerdijk 202",
        postal_code="1013 ZZ",
        city="Amsterdam",
        country="Netherlands",
        latitude=52.3872,
        longitude=4.8691,
        neighbourhood_id=houthavens.neighbourhood_id,
        submarket="Houthavens Central",
        building_type="High-end Office",
        year_built=2020,
        energy_label="A",
        total_building_area_m2=275,
        accessibility_note="A10 3 km",
        airport_note="Schiphol 17 km",
        building_amenities=["Rooftop terrace", "Bar"],
        description="A design-forward boutique office with a private rooftop terrace overlooking the harbour.",
        photos=["spaarndammerdijk-exterior.jpg"],
        source_url="https://example-brokerage.test/listings/spaarndammerdijk-202",
    )
    db.add(spaarndammerdijk)
    db.flush()

    spaarndammerdijk_unit = Unit(
        building_id=spaarndammerdijk.building_id,
        floor="3rd floor",
        available_area_m2=275,
        delivery_condition=DeliveryCondition.SHELL_AND_CORE_PLUS,
        rent_price_type=RentPriceType.FIXED,
        rent_eur_per_m2_year=238,
        service_charge_price_type=ServiceChargePriceType.FIXED,
        service_charge_eur_per_m2_year=57,
        contract_term="Until Jan 2030 (negotiable)",
        contract_term_years=None,
        availability="Available per direct",
        unit_amenities=["Rooftop access", "A/C"],
        photos=["spaarndammerdijk-unit-1.jpg"],
        floorplan_url="spaarndammerdijk-floorplan.pdf",
    )
    db.add(spaarndammerdijk_unit)
    db.flush()

    db.add(
        AddOn(
            building_id=spaarndammerdijk.building_id,
            name="High Performance Package",
            price=25,
            price_unit="EUR / m2 / year",
            quantity_available=None,
        )
    )

    # ── Building 5: Prinseneiland 12 — flex/serviced office, priced per desk/month
    #    rather than per m²/year (PricingModel.PER_DESK_MONTHLY), demonstrating the
    #    "Market Inventory" template's pricing shape alongside the direct-lease one ──
    prinseneiland = Building(
        name="Prinseneiland 12",
        address="Prinseneiland 12",
        postal_code="1013 LL",
        city="Amsterdam",
        country="Netherlands",
        latitude=52.3862,
        longitude=4.8869,
        neighbourhood_id=houthavens.neighbourhood_id,
        submarket="Houthavens Central",
        building_type="Flexible / Serviced Office",
        year_built=2017,
        energy_label="B",
        total_building_area_m2=120,
        accessibility_note="A10 3 km",
        airport_note="Schiphol 16 km",
        building_amenities=["Shared lounge", "Bicycle storage"],
        description="A boutique serviced-office floor above a converted warehouse, let fully fitted and desk-ready.",
        photos=["prinseneiland-exterior.jpg"],
        source_url="https://example-brokerage.test/listings/prinseneiland-12",
    )
    db.add(prinseneiland)
    db.flush()

    prinseneiland_unit = Unit(
        building_id=prinseneiland.building_id,
        floor="2nd floor",
        available_area_m2=120,
        delivery_condition=DeliveryCondition.TURN_KEY,
        pricing_model=PricingModel.PER_DESK_MONTHLY,
        desk_count=20,
        price_per_desk_month_eur=980,
        space_provider="Flexspace Central",
        meeting_room_note="No internal meeting room. Available in the building.",
        parking_ratio=None,
        contract_term="Flexible, from 1 month",
        contract_term_years=None,
        availability="Available per direct",
        unit_amenities=["Fully furnished", "High-speed fibre", "Shared kitchen"],
        photos=["prinseneiland-unit-1.jpg"],
        floorplan_url="prinseneiland-floorplan.pdf",
    )
    db.add(prinseneiland_unit)
    db.flush()

    # ── The Proposal itself ──
    proposal = Proposal(
        client_id=perry_ellis.client_id,
        title="Office Shortlist · Amsterdam 2026",
        prepared_by="Norderly Real Estate Advisors",
        document_type="Market Inventory",
        search_area_label="Houthavens, Amsterdam",
        project_team=[
            {
                "name": "Sam de Boer",
                "role": "Associate Director",
                "email": "sam.deboer@norderly.example",
                "phone": "+31 (0)6 1234 5678",
            },
            {
                "name": "Nina Alberts",
                "role": "Senior Consultant",
                "email": "nina.alberts@norderly.example",
                "phone": "+31 (0)6 8765 4321",
            },
        ],
        status=ProposalStatus.DRAFT,
        notes="Prepared exclusively for Perry Ellis. 8 locations selected in Houthavens, Amsterdam.",
    )
    db.add(proposal)
    db.flush()

    ordered_units = [
        danzigerkade_unit_a,
        danzigerkade_unit_b,
        moermanskkade_1st,
        moermanskkade_2nd,
        moermanskkade_4th,
        keilestraat_unit,
        spaarndammerdijk_unit,
        prinseneiland_unit,
    ]
    for rank, unit in enumerate(ordered_units):
        db.add(ProposalUnit(proposal_id=proposal.proposal_id, unit_id=unit.unit_id, display_rank=rank))

    db.commit()
    db.refresh(proposal)
    return proposal


def main() -> None:
    from app.database import SessionLocal, init_db

    init_db()
    db = SessionLocal()
    try:
        proposal = seed_database(db)
        print(f"Seeded proposal {proposal.proposal_id!r} — {proposal.title!r} with {len(proposal.selected_units)} units.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
