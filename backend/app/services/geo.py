"""Work out a building's transport distances from its address.

Listings state these only sometimes, and inconsistently ("A10 3 km", "NS-
station 800 m", nothing at all). This derives them from the address instead,
so every building in a client PDF can carry the same three facts.

Geocoding (address → coordinates) prefers Google's Geocoding API when
GOOGLE_MAPS_GEOCODING_API_KEY (or GOOGLE_MAPS_API_KEY, since one key can
cover both) is configured — Nominatim's public instance is meant for light,
human-driven use and silently rate-limits/soft-blocks traffic from shared
cloud IP ranges, which made real addresses come back as "not found" from a
Railway deployment. OSM/Nominatim is still the geocoding fallback so the
feature still works on a deployment with no API key configured.

The nearest-station search prefers Google's Places API (same key) for the
same reason, falling back to Overpass — tried across several public
mirrors in turn — only when no key is configured or Google found nothing.
Overpass itself has been confirmed entirely unreachable from Railway's
network (every mirror times out with zero bytes, not merely slow — checked
directly from a Railway-side sandbox, not just inferred from an app-level
symptom), so it is no longer relied on for anything else here.

Airport distance is looked up against NL_MAJOR_AIRPORTS, a short hardcoded
list of the Netherlands' actual commercial airports, instead of a live
"nearest place of type=airport" search: Google Places' airport type also
matches nearby airport-adjacent businesses (a transfer/shuttle company
physically closer to the search point than the terminal itself easily
outranks the airport in a plain nearest-match), and Overpass — besides
being unreachable — has the same false-match risk via any POI tagged
aeroway=aerodrome without actually being a scheduled-service airport.
There are only a handful of real candidates in this market, so naming them
is both more accurate and cheaper than searching for one. This does mean
the feature is Netherlands-specific for airport distance specifically (see
the module's other Dutch-specific defaults, e.g. country="Netherlands").

Highway access has no clean Places equivalent (no "nearest motorway
junction" place type) and no small enumerable list the way airports do, so
it's the one field still dependent on Overpass succeeding — the query for
it no longer bundles the airport search that used to ride along with it,
since a lighter, single-purpose query is more likely to complete before a
loaded public instance's response times out.

Distances are straight-line ("as the crow flies"); a driving time would
need a routing service and a key, and would still be a different number
from the one agents quote. The UI labels them as approximate for that
reason.

Every network call is injectable so the logic can be tested without touching
the internet, and every failure degrades to "no answer" rather than an error:
a missing distance is a blank field the broker can fill in, not a broken save.
"""
from __future__ import annotations

import functools
import json
import logging
import math
import os
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Callable

logger = logging.getLogger(__name__)

GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
GOOGLE_PLACES_NEARBY_URL = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
# Tried in order; the first to answer with a well-formed body wins. Public
# mirrors of the same dataset — overpass-api.de is the default and
# best-maintained, but a dead/rate-limiting instance must not take the
# whole feature down with it.
OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter",
]
# Nominatim's usage policy requires a genuine identifying User-Agent.
USER_AGENT = "ProposalEngine/1.0 (office availability tool; contact via deployment owner)"
TIMEOUT_SECONDS = 20
# Much shorter than TIMEOUT_SECONDS deliberately, and shorter than it might
# look like it needs to be: confirmed directly (both from a Railway-side
# sandbox and in this app's own production logs) that every mirror in
# OVERPASS_MIRRORS is currently completely unreachable from Railway's
# network — connections either hang with zero bytes back or fail outright,
# never "answers, just slowly". Waiting the old 10s per mirror for a
# doorbell nobody answers only made the one field with no fallback (highway
# access) the slowest part of every lookup for no benefit. 5s still gives a
# mirror that recovers, or a non-Railway deployment where these aren't
# blocked at all, a real chance to answer.
OVERPASS_MIRROR_TIMEOUT_SECONDS = 5

# How far out it is still worth looking for each kind of thing.
STATION_RADIUS_M = 20_000
MOTORWAY_RADIUS_M = 30_000

# The Netherlands' commercial airports (scheduled passenger service) — see
# the module docstring for why this is a short hardcoded list rather than a
# live "nearest place tagged as an airport" search. (name, IATA code,
# latitude, longitude); IATA is carried only for the label, e.g. "Schiphol
# (AMS)". Coordinates are the published airport reference point for each,
# accurate to well within the precision this feature already promises
# (straight-line, rounded to the nearest 50m/whole km).
NL_MAJOR_AIRPORTS = [
    ("Schiphol", "AMS", 52.3086, 4.7639),
    ("Rotterdam The Hague Airport", "RTM", 51.9569, 4.4372),
    ("Eindhoven Airport", "EIN", 51.4500, 5.3745),
    ("Groningen Airport Eelde", "GRQ", 53.1197, 6.5794),
    ("Maastricht Aachen Airport", "MST", 50.9117, 5.7703),
    ("Lelystad Airport", "LEY", 52.4603, 5.5267),
]

# "nearest_any" (the default) preserves the original behaviour exactly —
# nearest railway=station, whatever it turns out to be. Choosing a specific
# mode instead scopes the Overpass query to just that OSM tag combination,
# so the result is guaranteed to be that mode rather than merely labelled as
# it. train excludes station=subway so a metro stop tagged as a railway
# station (common in NL data) doesn't masquerade as a train result.
_STATION_FILTERS = {
    "train": '["railway"="station"]["station"!="subway"]',
    "subway": '["station"="subway"]',
    "tram": '["railway"="tram_stop"]',
    "bus": '["highway"="bus_stop"]',
}
TRANSPORT_LABELS = {"train": "Station", "subway": "Metro", "tram": "Tramhalte", "bus": "Bushalte"}

# Google Places "type" filter closest to each OSM tag combination above.
# Places has no tram-specific type — light_rail_station is the nearest
# match — and bus_station only covers major terminals, not curb-side stops,
# so a "bus" lookup is more likely to fall through to the Overpass path
# below than the other modes are.
_GOOGLE_PLACE_TYPES = {
    "train": "train_station",
    "subway": "subway_station",
    "tram": "light_rail_station",
    "bus": "bus_station",
}
_GOOGLE_TRANSIT_FALLBACK_TYPE = "transit_station"  # nearest_any / unrecognised mode

Fetcher = Callable[[str, bytes | None], str]


def _http(url: str, body: bytes | None = None, *, timeout: float = TIMEOUT_SECONDS) -> str:
    req = urllib.request.Request(url, data=body, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def _google_maps_api_key() -> str | None:
    return os.environ.get("GOOGLE_MAPS_GEOCODING_API_KEY") or os.environ.get("GOOGLE_MAPS_API_KEY")


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


def _nearest_known_airport(lat: float, lon: float) -> tuple[float, str]:
    """Always returns something — NL_MAJOR_AIRPORTS is short and fixed, so
    there's no "not found" case the way a live search has. Outside the
    Netherlands the "nearest" entry is simply far away and not a meaningful
    answer; see the module docstring."""
    name, iata, alat, alon = min(NL_MAJOR_AIRPORTS, key=lambda a: haversine_m(lat, lon, a[2], a[3]))
    return haversine_m(lat, lon, alat, alon), f"{name} ({iata})"


def format_distance(metres: float) -> str:
    """Round the way a broker writes it: metres up close, kilometres beyond."""
    if metres < 1000:
        return f"{int(round(metres / 50.0) * 50)} m"
    km = metres / 1000
    return f"{km:.1f} km" if km < 10 else f"{km:.0f} km"


def _geocode_query_candidates(
    address: str, city: str | None, postal_code: str | None, country: str | None
) -> list[str]:
    """Build queries from most to least specific, without repeating a part
    that's already embedded in another one.

    The address this is usually called with is itself "Street 8, 1081 LH
    Amsterdam" (city and postcode already folded in, by the capture or by
    hand) — appending city/postal_code again unconditionally used to produce
    "Street 8, 1081 LH Amsterdam, 1081 LH, Amsterdam", a malformed, redundant
    query Nominatim would reject outright. Every part is only added if it
    isn't already a substring of what's been assembled so far.
    """
    def norm(s: str) -> str:
        return " ".join(s.lower().split())

    parts: list[str] = []

    def add(part: str | None) -> None:
        if not part or not part.strip():
            return
        joined = norm(", ".join(parts))
        if norm(part) in joined:
            return
        parts.append(part.strip())

    add(address)
    add(postal_code)
    add(city)
    full = ", ".join(parts)
    add(country)
    with_country = ", ".join(parts)

    candidates = [with_country]
    if full != with_country:
        candidates.append(full)
    # Coarser fallbacks — still enough to place a building on the map (at
    # postcode/city precision) when the full address doesn't parse, which
    # matters more than failing outright: the distances are already
    # approximate straight lines, so a postcode-level start is consistent
    # with that, not a new kind of wrong.
    if postal_code and country:
        candidates.append(f"{postal_code}, {country}")
    if postal_code:
        candidates.append(postal_code)
    if city and country:
        candidates.append(f"{city}, {country}")
    if city:
        candidates.append(city)

    seen: set[str] = set()
    ordered: list[str] = []
    for c in candidates:
        key = norm(c)
        if key and key not in seen:
            seen.add(key)
            ordered.append(c)
    return ordered


def _google_geocode(query: str, api_key: str, *, fetch: Fetcher) -> tuple[float, float] | None:
    url = f"{GOOGLE_GEOCODE_URL}?" + urllib.parse.urlencode({"address": query, "key": api_key})
    try:
        data = json.loads(fetch(url, None))
    except Exception:
        logger.warning("Google geocoding request failed for %r", query, exc_info=True)
        return None
    status = data.get("status")
    if status != "OK":
        # Logged at warning (not error) — this is expected for ZERO_RESULTS
        # on a genuinely bad address, but for REQUEST_DENIED / INVALID_REQUEST
        # / OVER_QUERY_LIMIT it's the only place the real reason (Google's
        # error_message) ever surfaces; the caller only ever sees "not found".
        logger.warning(
            "Google geocoding returned status=%s for %r: %s", status, query, data.get("error_message")
        )
        return None
    try:
        location = data["results"][0]["geometry"]["location"]
        return float(location["lat"]), float(location["lng"])
    except (KeyError, IndexError, TypeError, ValueError):
        logger.warning("Google geocoding returned an unexpected shape for %r: %r", query, data)
        return None


def geocode(
    address: str,
    city: str | None = None,
    postal_code: str | None = None,
    country: str | None = "Netherlands",
    *,
    fetch: Fetcher = _http,
) -> tuple[float, float] | None:
    candidates = _geocode_query_candidates(address, city, postal_code, country)

    api_key = _google_maps_api_key()
    if api_key:
        for query in candidates:
            point = _google_geocode(query, api_key, fetch=fetch)
            if point:
                return point

    for query in candidates:
        url = f"{NOMINATIM_URL}?" + urllib.parse.urlencode(
            {"q": query, "format": "json", "limit": 1, "addressdetails": 0}
        )
        try:
            results = json.loads(fetch(url, None))
        except Exception:
            continue
        if not results:
            continue
        try:
            return float(results[0]["lat"]), float(results[0]["lon"])
        except (KeyError, TypeError, ValueError):
            continue
    return None


def _overpass_query(lat: float, lon: float, transport_mode: str = "nearest_any") -> str:
    # No airport clause — that's NL_MAJOR_AIRPORTS' job now (see module
    # docstring). Dropping it isn't just about relevance: it was a 150km-
    # radius search, by far the most expensive part of the old combined
    # query, and a lighter query is more likely to complete before a loaded
    # public Overpass instance's response times out.
    station_filter = _STATION_FILTERS.get(transport_mode, '["railway"="station"]')
    return f"""[out:json][timeout:25];
(
  nwr(around:{STATION_RADIUS_M},{lat},{lon}){station_filter};
  nwr(around:{MOTORWAY_RADIUS_M},{lat},{lon})["highway"="motorway_junction"];
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


def _matches_transport_mode(tags: dict, transport_mode: str) -> bool:
    """Mirrors _STATION_FILTERS' OSM tag logic. Overpass already applies the
    equivalent filter server-side, but re-checking it locally rather than
    trusting every returned element means a response that shouldn't have
    matched (or an unexpected shape) can't silently pass through as one —
    and it's what makes this testable without a stub that parses queries."""
    if transport_mode == "train":
        return tags.get("railway") == "station" and tags.get("station") != "subway"
    if transport_mode == "subway":
        return tags.get("station") == "subway"
    if transport_mode == "tram":
        return tags.get("railway") == "tram_stop"
    if transport_mode == "bus":
        return tags.get("highway") == "bus_stop"
    return tags.get("railway") == "station"  # nearest_any / unrecognised mode


def _google_nearby(
    lat: float, lon: float, place_type: str, api_key: str, *, fetch: Fetcher, kind: str
) -> tuple[float, str] | None:
    """Nearest place of `place_type`, ranked by distance. Returns
    (distance_metres, label) — the same shape the Overpass path below
    produces — so the two sources are interchangeable to the caller."""
    params = {"location": f"{lat},{lon}", "rankby": "distance", "type": place_type, "key": api_key}
    url = f"{GOOGLE_PLACES_NEARBY_URL}?" + urllib.parse.urlencode(params)
    try:
        data = json.loads(fetch(url, None))
    except Exception:
        logger.warning("Google Places request failed for %s (type=%s) at (%s, %s)", kind, place_type, lat, lon,
                        exc_info=True)
        return None
    status = data.get("status")
    if status not in ("OK", "ZERO_RESULTS"):
        logger.warning(
            "Google Places returned status=%s for %s (type=%s): %s", status, kind, place_type, data.get("error_message")
        )
    if status != "OK":
        return None
    results = data.get("results") or []
    if not results:
        return None
    try:
        location = results[0]["geometry"]["location"]
        distance = haversine_m(lat, lon, float(location["lat"]), float(location["lng"]))
        label = results[0].get("name") or place_type.replace("_", " ").title()
        return distance, label
    except (KeyError, TypeError, ValueError):
        logger.warning("Google Places returned an unexpected shape for %s (type=%s): %r", kind, place_type, data)
        return None


def _overpass_nearby(
    lat: float, lon: float, transport_mode: str, *, fetch: Fetcher
) -> dict[str, tuple[float, str]]:
    """Tries each mirror in OVERPASS_MIRRORS in turn, using a shorter
    per-attempt timeout than the default (see OVERPASS_MIRROR_TIMEOUT_SECONDS)
    so a dead mirror doesn't eat the whole request budget before the next
    one gets a turn. Only overrides the timeout for the real network
    fetcher — an injected test stub keeps whatever signature it already has."""
    overpass_fetch = functools.partial(_http, timeout=OVERPASS_MIRROR_TIMEOUT_SECONDS) if fetch is _http else fetch

    payload = _overpass_query(lat, lon, transport_mode).encode("utf-8")
    data = None
    for mirror in OVERPASS_MIRRORS:
        try:
            candidate = json.loads(overpass_fetch(mirror, payload))
        except Exception:
            logger.warning("Overpass mirror %s failed for (%s, %s)", mirror, lat, lon, exc_info=True)
            continue
        if "elements" in candidate:
            data = candidate
            break
        # Overpass answers a rejected/rate-limited query with a 200 and an
        # error body (or a remark/error field), not an HTTP failure — so the
        # except above never catches it. Surface that instead of silently
        # moving on to a result that looks identical to "nothing nearby".
        logger.warning("Overpass mirror %s returned no 'elements' for (%s, %s): %r", mirror, lat, lon, candidate)
    if data is None:
        return {}

    station_fallback = TRANSPORT_LABELS.get(transport_mode, "Station")
    best: dict[str, tuple[float, str]] = {}
    for el in data.get("elements", []):
        tags = el.get("tags") or {}
        point = _element_point(el)
        if not point:
            continue
        if tags.get("highway") == "motorway_junction":
            kind, fallback = "highway", "Motorway exit"
        elif _matches_transport_mode(tags, transport_mode):
            kind, fallback = "public_transport", station_fallback
        else:
            continue
        distance = haversine_m(lat, lon, point[0], point[1])
        label = _label(tags, fallback)
        if kind not in best or distance < best[kind][0]:
            best[kind] = (distance, label)
    return best


def nearby_distances(
    lat: float, lon: float, transport_mode: str = "nearest_any", *, fetch: Fetcher = _http
) -> Distances:
    # Always available, no network call: see NL_MAJOR_AIRPORTS / module
    # docstring for why airport doesn't go through a live nearest-place
    # search at all.
    best: dict[str, tuple[float, str]] = {"airport": _nearest_known_airport(lat, lon)}

    api_key = _google_maps_api_key()
    if api_key:
        place_type = _GOOGLE_PLACE_TYPES.get(transport_mode, _GOOGLE_TRANSIT_FALLBACK_TYPE)
        transit = _google_nearby(lat, lon, place_type, api_key, fetch=fetch, kind="public_transport")
        if transit:
            best["public_transport"] = transit

    # Overpass always runs: it's the only source for highway access, and the
    # fallback for public_transport whenever Google found nothing (no key
    # configured, the call failed, or it genuinely had no results).
    for kind, value in _overpass_nearby(lat, lon, transport_mode, fetch=fetch).items():
        best.setdefault(kind, value)

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
    country: str | None = "Netherlands",
    transport_mode: str = "nearest_any",
    *,
    fetch: Fetcher = _http,
) -> Distances:
    """Coordinates first (reuse them if the building already has them), then
    the three nearest points of interest."""
    if latitude is None or longitude is None:
        point = geocode(address, city, postal_code, country, fetch=fetch)
        if not point:
            return Distances()
        latitude, longitude = point
    return nearby_distances(latitude, longitude, transport_mode, fetch=fetch)
