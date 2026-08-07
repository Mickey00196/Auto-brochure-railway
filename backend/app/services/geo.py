"""Work out a building's transport distances from its address.

Listings state these only sometimes, and inconsistently ("A10 3 km", "NS-
station 800 m", nothing at all). This derives them from the address instead,
so every building in a client PDF can carry the same three facts.

Uses OpenStreetMap — Nominatim to turn the address into coordinates, Overpass
to find the nearest station, motorway access and airport — deliberately, so
the feature works on a deployment with no API key configured. Distances are
straight-line ("as the crow flies"); a driving time would need a routing
service and a key, and would still be a different number from the one agents
quote. The UI labels them as approximate for that reason.

Every network call is injectable so the logic can be tested without touching
the internet, and every failure degrades to "no answer" rather than an error:
a missing distance is a blank field the broker can fill in, not a broken save.
"""
from __future__ import annotations

import json
import math
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Callable

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
# Nominatim's usage policy requires a genuine identifying User-Agent.
USER_AGENT = "ProposalEngine/1.0 (office availability tool; contact via deployment owner)"
TIMEOUT_SECONDS = 20

# How far out it is still worth looking for each kind of thing.
STATION_RADIUS_M = 20_000
MOTORWAY_RADIUS_M = 30_000
AIRPORT_RADIUS_M = 150_000

Fetcher = Callable[[str, bytes | None], str]


def _http(url: str, body: bytes | None = None) -> str:
    req = urllib.request.Request(url, data=body, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
        return resp.read().decode("utf-8", "replace")


@dataclass
class Distances:
    latitude: float | None = None
    longitude: float | None = None
    public_transport: str | None = None
    highway: str | None = None
    airport: str | None = None


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def format_distance(metres: float) -> str:
    """Round the way a broker writes it: metres up close, kilometres beyond."""
    if metres < 1000:
        return f"{int(round(metres / 50.0) * 50)} m"
    km = metres / 1000
    return f"{km:.1f} km" if km < 10 else f"{km:.0f} km"


def geocode(address: str, city: str | None = None, postal_code: str | None = None,
            *, fetch: Fetcher = _http) -> tuple[float, float] | None:
    query = ", ".join(p for p in [address, postal_code, city] if p and p.strip())
    if not query.strip():
        return None
    url = f"{NOMINATIM_URL}?" + urllib.parse.urlencode(
        {"q": query, "format": "json", "limit": 1, "addressdetails": 0}
    )
    try:
        results = json.loads(fetch(url, None))
    except Exception:
        return None
    if not results:
        return None
    try:
        return float(results[0]["lat"]), float(results[0]["lon"])
    except (KeyError, TypeError, ValueError):
        return None


def _overpass_query(lat: float, lon: float) -> str:
    return f"""[out:json][timeout:25];
(
  nwr(around:{STATION_RADIUS_M},{lat},{lon})["railway"="station"];
  nwr(around:{MOTORWAY_RADIUS_M},{lat},{lon})["highway"="motorway_junction"];
  nwr(around:{AIRPORT_RADIUS_M},{lat},{lon})["aeroway"="aerodrome"]["iata"];
);
out center tags;"""


def _element_point(el: dict) -> tuple[float, float] | None:
    if "lat" in el and "lon" in el:
        return float(el["lat"]), float(el["lon"])
    center = el.get("center")
    if center and "lat" in center and "lon" in center:
        return float(center["lat"]), float(center["lon"])
    return None


def _label(tags: dict, fallback: str) -> str:
    for key in ("name", "ref", "name:en"):
        value = tags.get(key)
        if value:
            return str(value)
    return fallback


def nearby_distances(lat: float, lon: float, *, fetch: Fetcher = _http) -> Distances:
    try:
        payload = _overpass_query(lat, lon).encode("utf-8")
        data = json.loads(fetch(OVERPASS_URL, payload))
    except Exception:
        return Distances(latitude=lat, longitude=lon)

    best: dict[str, tuple[float, str]] = {}
    for el in data.get("elements", []):
        tags = el.get("tags") or {}
        point = _element_point(el)
        if not point:
            continue
        if tags.get("railway") == "station":
            kind, fallback = "public_transport", "Station"
        elif tags.get("highway") == "motorway_junction":
            kind, fallback = "highway", "Motorway exit"
        elif tags.get("aeroway") == "aerodrome":
            kind, fallback = "airport", "Airport"
        else:
            continue
        distance = haversine_m(lat, lon, point[0], point[1])
        label = _label(tags, fallback)
        if kind not in best or distance < best[kind][0]:
            best[kind] = (distance, label)

    return Distances(
        latitude=lat,
        longitude=lon,
        public_transport=f"{best['public_transport'][1]} {format_distance(best['public_transport'][0])}"
        if "public_transport" in best else None,
        highway=f"{best['highway'][1]} {format_distance(best['highway'][0])}" if "highway" in best else None,
        airport=f"{best['airport'][1]} {format_distance(best['airport'][0])}" if "airport" in best else None,
    )


def distances_for_address(
    address: str,
    city: str | None = None,
    postal_code: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    *,
    fetch: Fetcher = _http,
) -> Distances:
    """Coordinates first (reuse them if the building already has them), then
    the three nearest points of interest."""
    if latitude is None or longitude is None:
        point = geocode(address, city, postal_code, fetch=fetch)
        if not point:
            return Distances()
        latitude, longitude = point
    return nearby_distances(latitude, longitude, fetch=fetch)
