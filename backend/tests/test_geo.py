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
    _nearest_known_airport,
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


def test_nearest_known_airport_picks_the_right_one_not_just_schiphol():
    """Amsterdam's nearest airport is genuinely Schiphol — that alone
    wouldn't catch a bug where the function always returned the first list
    entry regardless of location. Rotterdam is close enough to both
    Schiphol and Rotterdam The Hague Airport that picking the wrong one
    would still look plausible without this."""
    rotterdam_lat, rotterdam_lon = 51.9244, 4.4777  # Rotterdam Centraal
    distance, label = _nearest_known_airport(rotterdam_lat, rotterdam_lon)
    assert label == "Rotterdam The Hague Airport (RTM)"
    assert distance < 15_000

    amsterdam_distance, amsterdam_label = _nearest_known_airport(LAT, LON)
    assert amsterdam_label == "Schiphol (AMS)"
    assert amsterdam_distance < 15_000


def test_picks_the_nearest_of_each_kind():
    elements = [
        {"lat": 52.3390, "lon": 4.8730, "tags": {"railway": "station", "name": "Amsterdam Zuid"}},
        {"lat": 52.3700, "lon": 4.8900, "tags": {"railway": "station", "name": "Amsterdam Centraal"}},
        {"lat": 52.3350, "lon": 4.8600, "tags": {"highway": "motorway_junction", "ref": "S109"}},
        {"lat": 52.3000, "lon": 4.9500, "tags": {"highway": "motorway_junction", "ref": "S112"}},
    ]
    d = nearby_distances(LAT, LON, fetch=_stub(overpass=_overpass(elements)))

    assert d.public_transport.startswith("Amsterdam Zuid ")   # not Centraal
    assert d.highway.startswith("S109 ")                       # not S112
    assert d.airport.startswith("Schiphol (AMS) ")             # from NL_MAJOR_AIRPORTS, not Overpass
    assert d.airport.endswith("km")
    assert (d.latitude, d.longitude) == (LAT, LON)


def test_prefers_google_places_for_transit_when_a_key_is_configured(monkeypatch):
    """Highway has no Google Places equivalent, so Overpass still supplies
    it — but transit should come from Google, not Overpass, when both could
    answer. The Overpass stub below deliberately returns a WORSE
    (farther/differently-named) station than Google's, so a wrong assertion
    here would mean Overpass's answer won it instead."""
    monkeypatch.setenv("GOOGLE_MAPS_GEOCODING_API_KEY", "test-key")
    overpass_elements = [
        {"lat": 52.3700, "lon": 4.8900, "tags": {"railway": "station", "name": "Wrong Station"}},
        {"lat": 52.3350, "lon": 4.8600, "tags": {"highway": "motorway_junction", "ref": "S109"}},
    ]

    def fetch(url: str, body: bytes | None) -> str:
        if "place/nearbysearch" in url:
            place = {"name": "Amsterdam Zuid", "geometry": {"location": {"lat": 52.3390, "lng": 4.8730}}}
            return json.dumps({"status": "OK", "results": [place]})
        return _overpass(overpass_elements)

    d = nearby_distances(LAT, LON, fetch=fetch)
    assert d.public_transport.startswith("Amsterdam Zuid ")
    assert d.highway.startswith("S109 ")  # only Overpass can supply this
    assert d.airport.startswith("Schiphol (AMS) ")  # unaffected by either source above


def test_falls_back_to_overpass_when_google_places_finds_nothing(monkeypatch):
    monkeypatch.setenv("GOOGLE_MAPS_GEOCODING_API_KEY", "test-key")
    elements = [{"lat": 52.3390, "lon": 4.8730, "tags": {"railway": "station", "name": "Amsterdam Zuid"}}]

    def fetch(url: str, body: bytes | None) -> str:
        if "place/nearbysearch" in url:
            return json.dumps({"status": "ZERO_RESULTS", "results": []})
        return _overpass(elements)

    d = nearby_distances(LAT, LON, fetch=fetch)
    assert d.public_transport.startswith("Amsterdam Zuid ")


def test_overpass_retries_the_next_mirror_when_the_first_fails():
    calls: list[str] = []
    elements = [{"lat": 52.3390, "lon": 4.8730, "tags": {"railway": "station", "name": "Amsterdam Zuid"}}]

    def fetch(url: str, body: bytes | None) -> str:
        calls.append(url)
        if len(calls) == 1:
            raise TimeoutError("mirror 1 is dead")
        return _overpass(elements)

    d = nearby_distances(LAT, LON, fetch=fetch)
    assert d.public_transport.startswith("Amsterdam Zuid ")
    assert len(calls) == 2


def test_google_places_skipped_entirely_without_a_key(monkeypatch):
    monkeypatch.delenv("GOOGLE_MAPS_GEOCODING_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY", raising=False)

    def fetch(url: str, body: bytes | None) -> str:
        assert "place/nearbysearch" not in url, "must not call Google Places without a key"
        elements = [{"lat": 52.3390, "lon": 4.8730, "tags": {"railway": "station", "name": "Amsterdam Zuid"}}]
        return _overpass(elements)

    d = nearby_distances(LAT, LON, fetch=fetch)
    assert d.public_transport.startswith("Amsterdam Zuid ")


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


def test_prefers_google_geocoding_when_a_key_is_configured(monkeypatch):
    """The Nominatim stub is intentionally missing (nominatim=None below) —
    if the code fell through to it instead of using Google, this fails with
    RuntimeError("geocoder unavailable") rather than a wrong assertion."""
    monkeypatch.setenv("GOOGLE_MAPS_GEOCODING_API_KEY", "test-key")
    google_response = json.dumps({"status": "OK", "results": [{"geometry": {"location": {"lat": LAT, "lng": LON}}}]})
    point = geocode(
        "Hildegard von Bingenstraat 8", "Amsterdam", "1081 LH", "Netherlands",
        fetch=lambda url, body: google_response,
    )
    assert point == (LAT, LON)


def test_falls_back_to_nominatim_when_google_finds_nothing(monkeypatch):
    """A configured key that fails to resolve (bad status, quota, wrong
    address) must not strand the lookup — Nominatim still gets a turn."""
    monkeypatch.setenv("GOOGLE_MAPS_GEOCODING_API_KEY", "test-key")
    calls = {"google": 0, "nominatim": 0}

    def fetch(url: str, body: bytes | None) -> str:
        if "maps.googleapis.com" in url:
            calls["google"] += 1
            return json.dumps({"status": "ZERO_RESULTS", "results": []})
        calls["nominatim"] += 1
        return json.dumps([{"lat": str(LAT), "lon": str(LON)}])

    point = geocode("Hildegard von Bingenstraat 8", "Amsterdam", "1081 LH", "Netherlands", fetch=fetch)
    assert point == (LAT, LON)
    assert calls["google"] >= 1
    assert calls["nominatim"] == 1


def test_skips_google_entirely_without_a_key(monkeypatch):
    monkeypatch.delenv("GOOGLE_MAPS_GEOCODING_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY", raising=False)
    nominatim = json.dumps([{"lat": str(LAT), "lon": str(LON)}])
    point = geocode(
        "Hildegard von Bingenstraat 8", "Amsterdam", "1081 LH", "Netherlands", fetch=_stub(nominatim=nominatim)
    )
    assert point == (LAT, LON)


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
    assert d.public_transport is None and d.highway is None
    # Airport doesn't depend on Overpass (or Google) at all — an outage of
    # either must not blank it.
    assert d.airport.startswith("Schiphol (AMS) ")


def test_ways_without_a_point_are_ignored_and_centres_are_used():
    elements = [
        {"type": "way", "tags": {"railway": "station", "name": "No geometry"}},
        {"type": "way", "center": {"lat": 52.3390, "lon": 4.8730},
         "tags": {"railway": "station", "name": "Amsterdam Zuid"}},
    ]
    d = nearby_distances(LAT, LON, fetch=_stub(overpass=_overpass(elements)))
    assert d.public_transport.startswith("Amsterdam Zuid ")


def test_transport_mode_train_excludes_a_subway_tagged_station():
    """A metro stop tagged railway=station + station=subway (common in NL
    OSM data) must not count as a "train" result — only nearest_any's
    untyped query should ever pick it up."""
    elements = [
        {"lat": 52.3390, "lon": 4.8730, "tags": {"railway": "station", "station": "subway", "name": "Metro stop"}},
    ]
    d = nearby_distances(LAT, LON, "train", fetch=_stub(overpass=_overpass(elements)))
    assert d.public_transport is None


def test_transport_mode_bus_uses_the_bus_stop_tag_and_label():
    elements = [
        {"lat": 52.3390, "lon": 4.8730, "tags": {"highway": "bus_stop"}},  # no name — falls back to the label
    ]
    d = nearby_distances(LAT, LON, "bus", fetch=_stub(overpass=_overpass(elements)))
    assert d.public_transport.startswith("Bushalte ")


def test_transport_mode_subway_uses_the_metro_label():
    elements = [
        {"lat": 52.3390, "lon": 4.8730, "tags": {"station": "subway"}},
    ]
    d = nearby_distances(LAT, LON, "subway", fetch=_stub(overpass=_overpass(elements)))
    assert d.public_transport.startswith("Metro ")


def test_transport_mode_still_finds_highway_and_airport():
    """A specific transport_mode only scopes the station clause — highway
    (from Overpass) and airport (from NL_MAJOR_AIRPORTS) must be
    unaffected."""
    elements = [{"lat": 52.3350, "lon": 4.8600, "tags": {"highway": "motorway_junction", "ref": "S109"}}]
    d = nearby_distances(LAT, LON, "bus", fetch=_stub(overpass=_overpass(elements)))
    assert d.highway.startswith("S109 ")
    assert d.airport.startswith("Schiphol (AMS) ")


def test_unknown_transport_mode_falls_back_to_nearest_any_behaviour():
    elements = [{"lat": 52.3390, "lon": 4.8730, "tags": {"railway": "station", "name": "Amsterdam Zuid"}}]
    d = nearby_distances(LAT, LON, "not-a-real-mode", fetch=_stub(overpass=_overpass(elements)))
    assert d.public_transport.startswith("Amsterdam Zuid ")


def test_endpoint_passes_transport_mode_through(client, monkeypatch):
    seen = {}

    def fake(*args, **kwargs):
        seen["mode"] = args[6] if len(args) > 6 else kwargs.get("transport_mode")
        return Distances(LAT, LON, "Bushalte 200 m", None, None)

    monkeypatch.setattr("app.routers.geo.distances_for_address", fake)
    r = client.post("/geo/distances", json={"address": "Hildegard von Bingenstraat 8", "transport_mode": "bus"})
    assert r.status_code == 200
    assert seen["mode"] == "bus"


def test_endpoint_defaults_transport_mode_to_nearest_any(client, monkeypatch):
    seen = {}

    def fake(*args, **kwargs):
        seen["mode"] = args[6] if len(args) > 6 else kwargs.get("transport_mode")
        return Distances()

    monkeypatch.setattr("app.routers.geo.distances_for_address", fake)
    r = client.post("/geo/distances", json={"address": "Hildegard von Bingenstraat 8"})
    assert r.status_code == 200
    assert seen["mode"] == "nearest_any"


def test_endpoint_rejects_an_invalid_transport_mode(client):
    r = client.post("/geo/distances", json={"address": "Hildegard von Bingenstraat 8", "transport_mode": "spaceship"})
    assert r.status_code == 422


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
