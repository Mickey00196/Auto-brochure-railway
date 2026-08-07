"""Transport distances derived from an address.

The network calls are stubbed: these pin the arithmetic, the picking of the
nearest of each kind, the formatting, and — most importantly — that every
failure mode degrades to "no answer" instead of raising.
"""
from __future__ import annotations

import json
import urllib.parse

import pytest

from app.services.geo import (
    Distances,
    _geocode_query_candidates,
    distances_for_address,
    format_distance,
    geocode,
    haversine_m,
    nearby_distances,
)

# Hildegard von Bingenstraat 8, Amsterdam Zuidas (real coordinates)
LAT, LON = 52.3376, 4.8721


def _overpass(elements: list[dict]) -> str:
    return json.dumps({"elements": elements})


def _stub(nominatim: str | None = None, overpass: str | None = None):
    def fetch(url: str, body: bytes | None) -> str:
        if body is None:
            if nominatim is None:
                raise RuntimeError("geocoder unavailable")
            return nominatim
        if overpass is None:
            raise RuntimeError("overpass unavailable")
        return overpass
    return fetch


def test_haversine_matches_known_distances():
    # One degree of latitude is ~111km anywhere on earth — the anchor.
    assert 110_000 < haversine_m(52.0, 4.0, 53.0, 4.0) < 112_000
    # Amsterdam Zuid → Schiphol: ~7.8km as the crow flies. Worth pinning,
    # because the ~15km people quote is the DRIVING distance — these numbers
    # are straight-line and the UI says so.
    assert 7_500 < haversine_m(52.3390, 4.8730, 52.3105, 4.7683) < 8_200


@pytest.mark.parametrize(
    "metres,expected",
    [(120, "100 m"), (860, "850 m"), (999, "1000 m"), (1200, "1.2 km"), (9940, "9.9 km"), (15400, "15 km")],
)
def test_distance_formatting_reads_like_a_broker_wrote_it(metres, expected):
    assert format_distance(metres) == expected


def test_picks_the_nearest_of_each_kind():
    elements = [
        {"lat": 52.3390, "lon": 4.8730, "tags": {"railway": "station", "name": "Amsterdam Zuid"}},
        {"lat": 52.3700, "lon": 4.8900, "tags": {"railway": "station", "name": "Amsterdam Centraal"}},
        {"lat": 52.3350, "lon": 4.8600, "tags": {"highway": "motorway_junction", "ref": "S109"}},
        {"lat": 52.3000, "lon": 4.9500, "tags": {"highway": "motorway_junction", "ref": "S112"}},
        {"lat": 52.3105, "lon": 4.7683, "tags": {"aeroway": "aerodrome", "iata": "AMS", "name": "Schiphol"}},
    ]
    d = nearby_distances(LAT, LON, fetch=_stub(overpass=_overpass(elements)))

    assert d.public_transport.startswith("Amsterdam Zuid ")   # not Centraal
    assert d.highway.startswith("S109 ")                       # not S112
    assert d.airport.startswith("Schiphol ")
    assert d.airport.endswith("km")
    assert (d.latitude, d.longitude) == (LAT, LON)


def test_geocodes_when_the_building_has_no_coordinates():
    nominatim = json.dumps([{"lat": str(LAT), "lon": str(LON)}])
    elements = [{"lat": 52.3390, "lon": 4.8730, "tags": {"railway": "station", "name": "Amsterdam Zuid"}}]
    d = distances_for_address(
        "Hildegard von Bingenstraat 8", "Amsterdam", "1081 LH",
        fetch=_stub(nominatim=nominatim, overpass=_overpass(elements)),
    )
    assert d.latitude == pytest.approx(LAT)
    assert d.public_transport.startswith("Amsterdam Zuid ")


def test_geocode_query_does_not_repeat_a_city_and_postcode_already_in_the_address():
    """The exact bug reported: a captured building's `address` field already
    reads "Street 8, 1081 LH Amsterdam" (postcode and city folded in by the
    capture), and unconditionally appending postal_code/city again produced
    "...Amsterdam, 1081 LH, Amsterdam" — a malformed, redundant query that
    Nominatim reasonably refused, surfacing as "couldn't place that address"
    for almost every captured building."""
    candidates = _geocode_query_candidates(
        "Hildegard von Bingenstraat 8, 1081 LH Amsterdam", "Amsterdam", "1081 LH", "Netherlands"
    )
    assert candidates[0] == "Hildegard von Bingenstraat 8, 1081 LH Amsterdam, Netherlands"
    assert candidates[0].lower().count("amsterdam") == 1
    assert candidates[0].lower().count("1081 lh") == 1


def test_geocode_query_still_appends_city_and_postcode_when_address_lacks_them():
    """A manually typed address with no postcode/city inline must still get
    them appended — the dedup must not eat legitimate parts."""
    candidates = _geocode_query_candidates(
        "Hildegard von Bingenstraat 8", "Amsterdam", "1081 LH", "Netherlands"
    )
    assert candidates[0] == "Hildegard von Bingenstraat 8, 1081 LH, Amsterdam, Netherlands"


def test_geocode_stops_at_the_first_candidate_that_resolves():
    calls: list[str] = []

    def fetch(url: str, body: bytes | None) -> str:
        q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)["q"][0]
        calls.append(q)
        if len(calls) == 1:
            return "[]"  # the most specific candidate finds nothing
        return json.dumps([{"lat": str(LAT), "lon": str(LON)}])

    point = geocode(
        "Hildegard von Bingenstraat 8, 1081 LH Amsterdam", "Amsterdam", "1081 LH", "Netherlands", fetch=fetch
    )
    assert point == (LAT, LON)
    assert len(calls) == 2, "must not keep trying once a candidate resolves"


def test_existing_coordinates_skip_the_geocoder():
    """A building already located must not be geocoded again — the stub has no
    geocoder at all, so this raises if it tries."""
    elements = [{"lat": 52.3390, "lon": 4.8730, "tags": {"railway": "station", "name": "Amsterdam Zuid"}}]
    d = distances_for_address("", None, None, LAT, LON, fetch=_stub(overpass=_overpass(elements)))
    assert d.public_transport is not None


def test_unknown_address_returns_nothing_rather_than_failing():
    d = distances_for_address("Nowhere 1", "Atlantis", fetch=_stub(nominatim="[]"))
    assert d == Distances()


def test_geocoder_outage_degrades_quietly():
    d = distances_for_address("Somewhere 1", "Amsterdam", fetch=_stub(nominatim=None))
    assert d == Distances()


def test_overpass_outage_keeps_the_coordinates():
    d = nearby_distances(LAT, LON, fetch=_stub(overpass=None))
    assert (d.latitude, d.longitude) == (LAT, LON)
    assert d.public_transport is None and d.highway is None and d.airport is None


def test_ways_without_a_point_are_ignored_and_centres_are_used():
    elements = [
        {"type": "way", "tags": {"railway": "station", "name": "No geometry"}},
        {"type": "way", "center": {"lat": 52.3390, "lon": 4.8730},
         "tags": {"railway": "station", "name": "Amsterdam Zuid"}},
    ]
    d = nearby_distances(LAT, LON, fetch=_stub(overpass=_overpass(elements)))
    assert d.public_transport.startswith("Amsterdam Zuid ")


def test_endpoint_reports_found_false_when_nothing_resolves(client, monkeypatch):
    monkeypatch.setattr("app.routers.geo.distances_for_address", lambda *a, **k: Distances())
    r = client.post("/geo/distances", json={"address": "Nowhere 1", "city": "Atlantis"})
    assert r.status_code == 200
    assert r.json()["found"] is False


def test_endpoint_returns_the_three_distances(client, monkeypatch):
    monkeypatch.setattr(
        "app.routers.geo.distances_for_address",
        lambda *a, **k: Distances(LAT, LON, "Amsterdam Zuid 850 m", "S109 1.2 km", "Schiphol 11 km"),
    )
    r = client.post("/geo/distances", json={"address": "Hildegard von Bingenstraat 8", "city": "Amsterdam"})
    body = r.json()
    assert body["found"] is True
    assert body["public_transport"] == "Amsterdam Zuid 850 m"
    assert body["highway"] == "S109 1.2 km"
    assert body["airport"] == "Schiphol 11 km"
