"""Derive a building's transport distances from its address (§ services/geo).

Kept stateless: it returns suggestions for the form to fill in, so the broker
sees and can correct them before anything is saved. Nothing here writes to a
Building.
"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.geo import distances_for_address

router = APIRouter(prefix="/geo", tags=["geo"])


class DistanceRequest(BaseModel):
    address: str = ""
    city: str | None = None
    postal_code: str | None = None
    latitude: float | None = None
    longitude: float | None = None


class DistanceResponse(BaseModel):
    latitude: float | None = None
    longitude: float | None = None
    public_transport: str | None = None
    highway: str | None = None
    airport: str | None = None
    found: bool = False


@router.post("/distances", response_model=DistanceResponse)
def distances(payload: DistanceRequest) -> DistanceResponse:
    d = distances_for_address(
        payload.address, payload.city, payload.postal_code, payload.latitude, payload.longitude
    )
    return DistanceResponse(
        latitude=d.latitude,
        longitude=d.longitude,
        public_transport=d.public_transport,
        highway=d.highway,
        airport=d.airport,
        found=any([d.public_transport, d.highway, d.airport]),
    )
