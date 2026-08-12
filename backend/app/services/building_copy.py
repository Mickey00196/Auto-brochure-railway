"""Deep-copy a library master Building into an independent, client-scoped
copy — the "Add from library" operation for a client folder (see
routers/buildings.py POST /{building_id}/copy-to-client).

The copy shares no rows with the master: once created it is never
live-synced back, so a PDF already sent to a client keeps its exact terms
even if the master building is edited or deleted afterward.
source_building_id is kept purely for a "Copied from library on {date}"
provenance line in the UI — nothing here or elsewhere reads it to keep data
in sync.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.addon import AddOn
from app.models.building import Building
from app.models.unit import Unit

_BUILDING_COPY_EXCLUDE = {
    "building_id",
    "client_id",
    "source_building_id",
    "created_at",
    "updated_at",
}
_UNIT_COPY_EXCLUDE = {"unit_id", "building_id", "created_at", "updated_at"}
_ADDON_COPY_EXCLUDE = {"addon_id", "unit_id", "building_id", "created_at"}


def _columns(model, exclude: set[str]) -> list[str]:
    return [c.key for c in model.__table__.columns if c.key not in exclude]


def copy_building_to_client(db: Session, building: Building, *, client_id: str) -> Building:
    copy = Building(
        **{col: getattr(building, col) for col in _columns(Building, _BUILDING_COPY_EXCLUDE)},
        client_id=client_id,
        source_building_id=building.building_id,
    )
    db.add(copy)
    db.flush()  # assign copy.building_id before wiring units/addons to it

    for addon in building.addons:
        db.add(
            AddOn(
                **{col: getattr(addon, col) for col in _columns(AddOn, _ADDON_COPY_EXCLUDE)},
                building_id=copy.building_id,
            )
        )

    for unit in building.units:
        unit_copy = Unit(
            **{col: getattr(unit, col) for col in _columns(Unit, _UNIT_COPY_EXCLUDE)},
            building_id=copy.building_id,
        )
        db.add(unit_copy)
        db.flush()  # assign unit_copy.unit_id before wiring its addons to it

        for addon in unit.addons:
            db.add(
                AddOn(
                    **{col: getattr(addon, col) for col in _columns(AddOn, _ADDON_COPY_EXCLUDE)},
                    unit_id=unit_copy.unit_id,
                )
            )

    db.commit()
    db.refresh(copy)
    return copy
