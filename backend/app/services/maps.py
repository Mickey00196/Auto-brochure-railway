"""§11 Maps — generated once per Neighbourhood, not once per Unit (§5.4).

Static-map URL builders for Google Maps / Mapbox. Both require an API key
(GOOGLE_MAPS_API_KEY / MAPBOX_ACCESS_TOKEN) to actually resolve; this module
builds the correct request shape and is provider-agnostic at the call site,
so wiring in real credentials is a config change, not a rewrite.
"""
from __future__ import annotations

import os
from urllib.parse import urlencode

from app.models import Building, Neighbourhood


def location_map_url(building: Building) -> str | None:
    if building.latitude is None or building.longitude is None:
        return None
    api_key = os.environ.get("GOOGLE_MAPS_API_KEY")
    params = {
        "center": f"{building.latitude},{building.longitude}",
        "zoom": "15",
        "size": "640x400",
        "markers": f"color:red|{building.latitude},{building.longitude}",
    }
    if api_key:
        params["key"] = api_key
    return f"https://maps.googleapis.com/maps/api/staticmap?{urlencode(params)}"


def walking_radius_map_url(building: Building, radius_m: int = 800) -> str | None:
    if building.latitude is None or building.longitude is None:
        return None
    api_key = os.environ.get("MAPBOX_ACCESS_TOKEN")
    token_part = api_key or "REPLACE_WITH_MAPBOX_ACCESS_TOKEN"
    return (
        f"https://api.mapbox.com/styles/v1/mapbox/light-v11/static/"
        f"{building.longitude},{building.latitude},14,0/640x400"
        f"?access_token={token_part}&radius={radius_m}"
    )


def points_of_interest(neighbourhood: Neighbourhood) -> list[dict]:
    """Sourced from the Neighbourhood record so this is computed once per
    area rather than re-derived per unit (§11)."""
    return [
        {"category": a.get("category"), "name": a.get("name"), "walking_time_min": a.get("walking_time_min")}
        for a in (neighbourhood.nearby_amenities or [])
    ]


def public_transport_map(neighbourhood: Neighbourhood) -> list[dict]:
    return list(neighbourhood.public_transport or [])


def build_region_map_url(
    numbered_buildings: list[tuple[int, Building]], *, size: str = "800x520", grayscale: bool = True
) -> str | None:
    """Static map with one numbered red pin per building, matching the
    "Market Inventory" template's grayscale region-map pages. Numbers are
    passed in by the caller (global sequence across the whole Proposal, not
    restarted per region) so a property's badge matches across the region
    page, its own detail page, and the final All Properties Overview.
    """
    located = [(index, b) for index, b in numbered_buildings if b.latitude is not None and b.longitude is not None]
    if not located:
        return None

    api_key = os.environ.get("GOOGLE_MAPS_API_KEY")
    params: list[tuple[str, str]] = [("size", size), ("scale", "2")]
    if grayscale:
        params.append(("style", "feature:all|saturation:-100|lightness:5"))
    for index, building in located:
        # Static Maps marker labels are a single alphanumeric character — fall
        # back to a dot for anything past 9 rather than silently truncating.
        label = str(index) if 1 <= index <= 9 else "•"
        params.append(("markers", f"color:0xC8102E|label:{label}|{building.latitude},{building.longitude}"))
    if api_key:
        params.append(("key", api_key))
    return f"https://maps.googleapis.com/maps/api/staticmap?{urlencode(params)}"


def fetch_static_map_image(url: str, *, timeout: float = 8.0) -> bytes | None:
    """Downloads the map tile. Returns None — never raises — on any failure
    (missing API key, no network, non-200/non-image response) so callers can
    fall back to a placeholder without special-casing every error mode.
    """
    import urllib.error
    import urllib.request

    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:  # noqa: S310 - fixed https googleapis.com host
            if response.status != 200:
                return None
            if not response.headers.get("Content-Type", "").startswith("image/"):
                return None
            return response.read()
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        return None
