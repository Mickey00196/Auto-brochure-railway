"""Point-to-polyline distance to the nearest motorway (nearest_highway_line),
a separate, more precise measurement from the existing
nearest-motorway_junction-node `highway` field. Motorway-only by default —
highway=primary is an ordinary arterial city road in OSM tagging, not a
motorway; trunk/trunk_link are opt-in via include_trunk_roads.

Heaviest coverage is on point_to_segment_distance_m — the function most
likely to have edge-case bugs, per its own docstring: a point whose
projection onto the segment's line falls before the start, after the end,
or within the segment itself, plus the degenerate zero-length "segment".
"""
from __future__ import annotations

import json
import math
import time

import pytest

from app.services.geo import (
    Distances,
    _highway_label,
    _highway_line_query,
    _nearest_distance_on_way_m,
    _planar_project,
    haversine_m,
    nearby_distances,
    nearest_highway_line,
    point_to_segment_distance_m,
)

# ---------------------------------------------------------------------------
# point_to_segment_distance_m — pure planar geometry, no network involved.
# ---------------------------------------------------------------------------


def test_point_directly_above_the_segment_midpoint():
    # A=(0,0) B=(10,0), P=(5,3) — perpendicular distance to the segment is
    # exactly 3, and the projection (5,0) is comfortably within [A, B].
    assert point_to_segment_distance_m(5, 3, 0, 0, 10, 0) == pytest.approx(3.0)


def test_point_projects_before_the_start_clamps_to_a():
    # P is "behind" A along the line AB — must measure to A itself (5), not
    # to A's projection onto the infinite line (which would be nonsensical
    # here since P already IS on that line, distance 0 — the bug this
    # guards against is treating the segment as an infinite line).
    assert point_to_segment_distance_m(-5, 0, 0, 0, 10, 0) == pytest.approx(5.0)


def test_point_projects_past_the_end_clamps_to_b():
    assert point_to_segment_distance_m(15, 0, 0, 0, 10, 0) == pytest.approx(5.0)


def test_point_projects_past_the_end_off_axis_clamps_to_b_not_the_line():
    # P=(13,4): projecting onto the infinite line through A-B gives x=13
    # (past B), so clamping must snap to B=(10,0) — distance sqrt(9+16)=5 —
    # not to the unclamped projection (13,0), which would understate it.
    assert point_to_segment_distance_m(13, 4, 0, 0, 10, 0) == pytest.approx(5.0)


def test_point_exactly_on_the_segment_is_zero():
    assert point_to_segment_distance_m(4, 0, 0, 0, 10, 0) == pytest.approx(0.0)


def test_point_exactly_at_an_endpoint_is_zero():
    assert point_to_segment_distance_m(0, 0, 0, 0, 10, 0) == pytest.approx(0.0)
    assert point_to_segment_distance_m(10, 0, 0, 0, 10, 0) == pytest.approx(0.0)


def test_degenerate_zero_length_segment_is_point_to_point_distance():
    # A and B coincide (e.g. two consecutive identical nodes in a way) —
    # must not divide by zero, and must fall back to plain distance to that
    # single point.
    assert point_to_segment_distance_m(3, 4, 0, 0, 0, 0) == pytest.approx(5.0)  # 3-4-5 triangle
    assert point_to_segment_distance_m(0, 0, 7, 7, 7, 7) == pytest.approx(math.hypot(7, 7))


def test_diagonal_segment_known_triangle():
    # A=(0,0) B=(4,3) (a 3-4-5 line, length 5), P=(4,0). The projection of P
    # onto AB lands within the segment; the perpendicular distance from a
    # point to a line through the origin is |ax*py - ay*px| / |AB|.
    distance = point_to_segment_distance_m(4, 0, 0, 0, 4, 3)
    assert distance == pytest.approx(abs(4 * 0 - 3 * 4) / 5)  # = 12/5 = 2.4


def test_vertical_segment():
    assert point_to_segment_distance_m(5, 5, 0, 0, 0, 10) == pytest.approx(5.0)


def test_reversing_the_segment_endpoints_gives_the_same_distance():
    """The segment is undirected — AB and BA must measure identically."""
    forward = point_to_segment_distance_m(5, 3, 0, 0, 10, 0)
    backward = point_to_segment_distance_m(5, 3, 10, 0, 0, 0)
    assert forward == pytest.approx(backward)


# ---------------------------------------------------------------------------
# _nearest_distance_on_way_m — minimum across every segment of a way.
# ---------------------------------------------------------------------------


def test_nearest_distance_on_way_picks_the_closest_segment_not_the_first():
    # Property at Amsterdam Zuid; a bent way running north then east. The
    # first leg passes ~1.1km away, the second leg passes ~200m away — the
    # function must report the second (smaller) one, not the first segment
    # it iterates.
    prop_lat, prop_lon = 52.3376, 4.8721
    geometry = [
        {"lat": 52.3600, "lon": 4.8721},  # far north
        {"lat": 52.3600, "lon": 4.9200},  # then east — still far
        {"lat": 52.3390, "lon": 4.8730},  # then south, close to the property
        {"lat": 52.3376, "lon": 4.9200},  # then east again, moving away
    ]
    distance = _nearest_distance_on_way_m(prop_lat, prop_lon, geometry)
    assert distance is not None
    assert distance < 300  # close to the third node, not the ~1km-plus legs


def test_nearest_distance_on_way_requires_at_least_two_usable_nodes():
    assert _nearest_distance_on_way_m(52.3376, 4.8721, []) is None
    assert _nearest_distance_on_way_m(52.3376, 4.8721, [{"lat": 52.34, "lon": 4.87}]) is None


def test_nearest_distance_on_way_skips_malformed_nodes_without_crashing():
    """A node missing lat/lon (Overpass returning a partial geometry entry)
    must not raise — the segments touching it are skipped, not the whole
    way."""
    geometry = [
        {"lat": 52.3390, "lon": 4.8730},
        {},  # malformed — no lat/lon
        {"lat": 52.3392, "lon": 4.8735},
    ]
    distance = _nearest_distance_on_way_m(52.3376, 4.8721, geometry)
    assert distance is not None and distance > 0


def test_planar_project_differences_approximate_real_world_metres():
    """Sanity check that the projection's distances line up with haversine
    over a short (~1km) span — the whole point of the approximation."""
    lat1, lon1 = 52.3376, 4.8721
    lat2, lon2 = 52.3466, 4.8721  # ~1km due north
    x1, y1 = _planar_project(lat1, lon1, lat1)
    x2, y2 = _planar_project(lat2, lon2, lat1)
    planar_distance = math.hypot(x2 - x1, y2 - y1)
    geodesic_distance = haversine_m(lat1, lon1, lat2, lon2)
    assert planar_distance == pytest.approx(geodesic_distance, rel=0.01)


# ---------------------------------------------------------------------------
# _highway_label — ref preferred over name (opposite of _label()'s order).
# ---------------------------------------------------------------------------


def test_highway_label_prefers_ref_over_name():
    assert _highway_label({"ref": "A10", "name": "Nieuwe Meerdijk"}) == "A10"


def test_highway_label_falls_back_to_name_without_a_ref():
    assert _highway_label({"name": "Utrechtsebaan"}) == "Utrechtsebaan"


def test_highway_label_falls_back_to_a_generic_label():
    assert _highway_label({}) == "Highway"


# ---------------------------------------------------------------------------
# _highway_line_query / _highway_line_tag_filter — sanity on the Overpass QL
# built, and specifically that it does NOT match highway=primary: an
# ordinary arterial city road in OSM tagging (e.g. Amsterdam's
# Stadhouderskade), not a motorway, whose earlier inclusion here is the bug
# this file's regression test below is named for.
# ---------------------------------------------------------------------------


def test_highway_line_query_requests_full_geometry_not_just_a_point():
    query = _highway_line_query(52.3376, 4.8721, 2000, include_trunk_roads=False)
    assert "out geom;" in query
    assert "around:2000,52.3376,4.8721" in query


def test_highway_line_query_matches_motorway_only_by_default():
    query = _highway_line_query(52.3376, 4.8721, 2000, include_trunk_roads=False)
    assert '"highway"~"^(motorway|motorway_link)$"' in query
    assert "primary" not in query
    assert "trunk" not in query


def test_highway_line_query_opts_into_trunk_roads_when_asked():
    query = _highway_line_query(52.3376, 4.8721, 2000, include_trunk_roads=True)
    assert '"highway"~"^(motorway|motorway_link|trunk|trunk_link)$"' in query
    assert "primary" not in query


# ---------------------------------------------------------------------------
# nearest_highway_line — radius retry, graceful failure, Overpass parsing.
# ---------------------------------------------------------------------------

# A10 (Amsterdam ring), running roughly east-west a few hundred metres
# north of the property used throughout these tests.
_A10_WAY = {
    "type": "way",
    "tags": {"highway": "motorway", "ref": "A10"},
    "geometry": [{"lat": 52.3395, "lon": 4.8600}, {"lat": 52.3395, "lon": 4.8850}],
}


def _overpass_response(elements: list[dict]) -> str:
    return json.dumps({"elements": elements})


def test_finds_a_road_within_the_initial_radius():
    def fetch(url: str, body: bytes | None) -> str:
        assert "around:2000" in body.decode()
        return _overpass_response([_A10_WAY])

    result = nearest_highway_line(52.3376, 4.8721, fetch=fetch)
    assert result is not None
    distance, label = result
    assert label == "A10"
    assert 0 < distance < 2000


def test_retries_at_the_wider_radius_when_nothing_is_found_at_first():
    calls: list[str] = []

    def fetch(url: str, body: bytes | None) -> str:
        text = body.decode()
        calls.append(text)
        if "around:2000" in text:
            return _overpass_response([])  # nothing within 2km
        return _overpass_response([_A10_WAY])

    result = nearest_highway_line(52.3376, 4.8721, fetch=fetch)
    assert result is not None
    assert result[1] == "A10"
    assert len(calls) == 2
    assert "around:2000" in calls[0]
    assert "around:10000" in calls[1]


def test_gives_up_after_both_radii_find_nothing():
    def fetch(url: str, body: bytes | None) -> str:
        return _overpass_response([])

    assert nearest_highway_line(52.3376, 4.8721, fetch=fetch) is None


def test_does_not_retry_a_second_time_when_radius_equals_max_radius():
    calls = []

    def fetch(url: str, body: bytes | None) -> str:
        calls.append(1)
        return _overpass_response([])

    nearest_highway_line(52.3376, 4.8721, radius_m=5000, max_radius_m=5000, fetch=fetch)
    assert len(calls) == 1


def test_degrades_to_none_on_a_request_failure_rather_than_raising():
    def fetch(url: str, body: bytes | None) -> str:
        raise TimeoutError("Overpass unreachable")

    assert nearest_highway_line(52.3376, 4.8721, fetch=fetch) is None


def test_degrades_to_none_on_a_malformed_response():
    def fetch(url: str, body: bytes | None) -> str:
        return json.dumps({"remark": "runtime error: rate limited"})

    assert nearest_highway_line(52.3376, 4.8721, fetch=fetch) is None


def test_does_not_retry_the_wider_radius_after_a_request_failure():
    """The bug this guards against: when Overpass is genuinely unreachable
    (every request times out, not just this one radius), retrying at the
    wider radius spends a second full timeout for zero chance of a
    different outcome — the request never got far enough to depend on the
    radius. Only a genuine empty *result* (a real response with no
    matching road) is worth retrying wider; a failed *request* is not."""
    calls: list[str] = []

    def fetch(url: str, body: bytes | None) -> str:
        calls.append(url)
        raise TimeoutError("Overpass unreachable")

    assert nearest_highway_line(52.3376, 4.8721, fetch=fetch) is None
    assert len(calls) == 1


def test_does_not_retry_the_wider_radius_after_a_malformed_response():
    calls: list[str] = []

    def fetch(url: str, body: bytes | None) -> str:
        calls.append(url)
        return json.dumps({"remark": "runtime error: rate limited"})

    assert nearest_highway_line(52.3376, 4.8721, fetch=fetch) is None
    assert len(calls) == 1


def test_still_retries_the_wider_radius_after_a_genuine_empty_result():
    """The counterpart to the two tests above: a well-formed response that
    simply has no matching road in it IS worth retrying at the wider
    radius — this must keep working after the fix above, not regress into
    never retrying at all."""
    calls: list[str] = []

    def fetch(url: str, body: bytes | None) -> str:
        calls.append(url)
        if len(calls) == 1:
            return _overpass_response([])  # a real, empty response
        return _overpass_response([_A10_WAY])

    result = nearest_highway_line(52.3376, 4.8721, fetch=fetch)
    assert result is not None
    assert result[1] == "A10"
    assert len(calls) == 2


def test_ignores_non_way_elements_and_ways_without_geometry():
    elements = [
        {"type": "node", "tags": {"highway": "motorway"}, "lat": 52.34, "lon": 4.87},
        {"type": "way", "tags": {"ref": "A9"}, "geometry": []},  # no usable geometry
        _A10_WAY,
    ]

    def fetch(url: str, body: bytes | None) -> str:
        return _overpass_response(elements)

    result = nearest_highway_line(52.3376, 4.8721, fetch=fetch)
    assert result is not None
    assert result[1] == "A10"  # not the node, not the empty-geometry way


def test_picks_the_nearest_of_several_roads():
    farther = {
        "type": "way",
        "tags": {"highway": "motorway", "ref": "A9"},
        "geometry": [{"lat": 52.4000, "lon": 4.8600}, {"lat": 52.4000, "lon": 4.8850}],
    }

    def fetch(url: str, body: bytes | None) -> str:
        return _overpass_response([farther, _A10_WAY])

    result = nearest_highway_line(52.3376, 4.8721, fetch=fetch)
    assert result is not None
    assert result[1] == "A10"


# ---------------------------------------------------------------------------
# Integration: the fields actually reach Distances / nearby_distances.
# ---------------------------------------------------------------------------


def test_nearby_distances_includes_the_new_highway_line_fields(monkeypatch):
    monkeypatch.delenv("GOOGLE_MAPS_GEOCODING_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY", raising=False)

    def fetch(url: str, body: bytes | None) -> str:
        text = (body or b"").decode()
        if "out geom;" in text:
            return _overpass_response([_A10_WAY])
        return _overpass_response([])  # the existing station/motorway-junction query: nothing

    d = nearby_distances(52.3376, 4.8721, fetch=fetch)
    assert isinstance(d, Distances)
    assert d.nearest_highway_name == "A10"
    assert d.distance_to_highway_km is not None
    assert d.distance_to_highway_km > 0
    # Rounded to km with 2 decimal places, matching format elsewhere in
    # this module's public-facing numbers.
    assert d.distance_to_highway_km == round(d.distance_to_highway_km, 2)


def test_nearby_distances_leaves_highway_line_fields_none_when_nothing_found(monkeypatch):
    monkeypatch.delenv("GOOGLE_MAPS_GEOCODING_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY", raising=False)

    def fetch(url: str, body: bytes | None) -> str:
        return _overpass_response([])

    d = nearby_distances(52.3376, 4.8721, fetch=fetch)
    assert d.distance_to_highway_km is None
    assert d.nearest_highway_name is None


# ---------------------------------------------------------------------------
# Regression: highway=primary is an ordinary city arterial road in OSM
# tagging, not a motorway — the reported bug. Herengracht 206, Amsterdam is
# a real inner-city canal-ring address; before this fix, a ~1.5km-away
# primary-tagged street (Stadhouderskade/Nassaukade territory) was reported
# as the "nearest highway" instead of the real A10 ring road, ~3.5-4km out.
# ---------------------------------------------------------------------------

_HERENGRACHT_206_LAT, _HERENGRACHT_206_LON = 52.3717, 4.8865

# A plausible stand-in for Stadhouderskade/Nassaukade: a real Amsterdam
# arterial, correctly tagged highway=primary (not motorway), a short
# distance from the property.
_NEARBY_PRIMARY_WAY = {
    "type": "way",
    "tags": {"highway": "primary", "ref": "S109", "name": "Stadhouderskade"},
    "geometry": [{"lat": 52.3582, "lon": 4.8850}, {"lat": 52.3580, "lon": 4.8900}],
}


def test_regression_herengracht_206_finds_the_real_motorway_not_the_nearby_primary_road():
    """The exact bug reported: an inner-city address' "nearest highway"
    came back as a nearby primary-tagged street instead of the real,
    farther-away motorway. The stub below deliberately still includes the
    primary way in both responses — a correctly-scoped Overpass server
    would never return it once the query excludes highway=primary, but
    this proves the client-side re-check added alongside the query fix is
    what actually keeps it out, not just an assumption that the request
    URL was built correctly."""
    calls: list[str] = []

    def fetch(url: str, body: bytes | None) -> str:
        text = body.decode()
        calls.append(text)
        if "around:2000" in text:
            # Nothing motorway-tagged this close — matches reality: the
            # A10 is several km from a canal-ring address.
            return _overpass_response([_NEARBY_PRIMARY_WAY])
        return _overpass_response([_NEARBY_PRIMARY_WAY, _A10_WAY])

    result = nearest_highway_line(_HERENGRACHT_206_LAT, _HERENGRACHT_206_LON, fetch=fetch)

    assert result is not None
    distance_m, label = result
    assert label == "A10"
    assert label != "S109"
    # Real motorways from a dense Amsterdam canal-ring address are
    # typically several km out — this pins the fix to the right ballpark
    # (not ~1.5km, the nearby arterial street's distance), not just "some
    # positive number".
    assert 3_000 < distance_m < 6_000
    # The 2km attempt must have actually run and found nothing motorway-
    # tagged (proving the widen-to-10km fallback is what supplied the real
    # answer), not skipped straight to the wide radius.
    assert len(calls) == 2
    assert "around:2000" in calls[0]
    assert "around:10000" in calls[1]


def test_client_side_filter_ignores_a_primary_tagged_way_even_when_closer():
    """A narrower, single-radius version of the regression test above: a
    primary-tagged way must never win over a genuinely farther
    motorway-tagged one, regardless of which Overpass lists first or which
    one is physically closer to the property."""
    close_but_wrong_type = {
        "type": "way",
        "tags": {"highway": "primary", "ref": "N200"},
        "geometry": [{"lat": 52.3390, "lon": 4.8730}, {"lat": 52.3391, "lon": 4.8735}],  # metres away
    }

    def fetch(url: str, body: bytes | None) -> str:
        return _overpass_response([close_but_wrong_type, _A10_WAY])

    result = nearest_highway_line(52.3376, 4.8721, fetch=fetch)
    assert result is not None
    assert result[1] == "A10"


def test_trunk_roads_only_match_when_explicitly_opted_in():
    trunk_way = {
        "type": "way",
        "tags": {"highway": "trunk", "ref": "N201"},
        "geometry": [{"lat": 52.3390, "lon": 4.8730}, {"lat": 52.3391, "lon": 4.8735}],
    }

    def fetch(url: str, body: bytes | None) -> str:
        return _overpass_response([trunk_way])

    # Default (motorway-only): a trunk-tagged way must not match at all —
    # not even as a worse-than-nothing fallback.
    assert nearest_highway_line(52.3376, 4.8721, fetch=fetch) is None

    result = nearest_highway_line(52.3376, 4.8721, include_trunk_roads=True, fetch=fetch)
    assert result is not None
    assert result[1] == "N201"


def test_trunk_and_motorway_can_both_match_when_opted_in():
    trunk_way = {
        "type": "way",
        "tags": {"highway": "trunk_link", "ref": "N201"},
        "geometry": [{"lat": 52.3390, "lon": 4.8730}, {"lat": 52.3391, "lon": 4.8735}],
    }

    def fetch(url: str, body: bytes | None) -> str:
        return _overpass_response([trunk_way, _A10_WAY])

    result = nearest_highway_line(52.3376, 4.8721, include_trunk_roads=True, fetch=fetch)
    assert result is not None  # picks whichever is genuinely nearer, not just "any match"


# ---------------------------------------------------------------------------
# nearby_distances runs its independent network lookups concurrently.
# ---------------------------------------------------------------------------


def test_nearby_distances_runs_lookups_concurrently_not_sequentially(monkeypatch):
    """The whole point of parallelizing: three independent network calls
    (Google Places, the station/motorway_junction Overpass query, and
    nearest_highway_line) must overlap, not queue up one after another.
    Each fetch below sleeps briefly; sequential execution would take
    roughly the sum of every sleep, concurrent execution roughly the
    longest single branch's own total.

    That longest branch is nearest_highway_line, not either of the other
    two: an empty Overpass response (as below) makes it retry once at the
    wider radius — two sequential sleeps by design, even while its whole
    branch runs in parallel with the other two. So "concurrent" here means
    ~2 sleeps (the true floor), not ~1 — the assertion checks for that,
    comfortably below the ~4-sleep total a fully sequential implementation
    (Google + station-Overpass + highway-line's own two hops) would take.
    """
    monkeypatch.setenv("GOOGLE_MAPS_GEOCODING_API_KEY", "test-key")
    sleep_seconds = 0.2

    def fetch(url: str, body: bytes | None) -> str:
        time.sleep(sleep_seconds)
        if "place/nearbysearch" in url:
            return json.dumps({"status": "ZERO_RESULTS", "results": []})
        return _overpass_response([])  # both Overpass paths: genuinely nothing found

    start = time.monotonic()
    nearby_distances(52.3376, 4.8721, fetch=fetch)
    elapsed = time.monotonic() - start

    assert elapsed < sleep_seconds * 3
