"""Named, saved shortlists — the counterpart to the library (§ library.py).

These pin the CRUD contract and, most importantly, that a Selection is
independent of the library it draws from: saving, reopening, adjusting and
duplicating one must never mutate a Building.
"""
from __future__ import annotations


def _library_buildings(client) -> list[dict]:
    client.post("/seed/demo")
    return client.get("/buildings").json()


def test_creates_and_lists_a_selection(client):
    buildings = _library_buildings(client)
    ids = [b["building_id"] for b in buildings[:2]]

    r = client.post("/selections", json={"client_name": "Acme BV", "building_ids": ids, "prepared_by": "Jo"})
    assert r.status_code == 201
    body = r.json()
    assert body["client_name"] == "Acme BV"
    assert body["building_ids"] == ids
    assert body["prepared_by"] == "Jo"
    assert body["selection_id"]

    listed = client.get("/selections").json()
    assert any(s["selection_id"] == body["selection_id"] for s in listed)


def test_get_update_and_delete_a_selection(client):
    buildings = _library_buildings(client)
    ids = [b["building_id"] for b in buildings[:2]]
    created = client.post("/selections", json={"client_name": "Acme BV", "building_ids": ids}).json()
    sid = created["selection_id"]

    fetched = client.get(f"/selections/{sid}")
    assert fetched.status_code == 200
    assert fetched.json()["client_name"] == "Acme BV"

    # Adjusting: drop one building, rename the client.
    updated = client.put(f"/selections/{sid}", json={"client_name": "Acme Holding", "building_ids": ids[:1]})
    assert updated.status_code == 200
    assert updated.json()["client_name"] == "Acme Holding"
    assert updated.json()["building_ids"] == ids[:1]

    # A partial update must not clobber fields it didn't mention.
    partial = client.put(f"/selections/{sid}", json={"prepared_by": "Sam"})
    assert partial.status_code == 200
    assert partial.json()["client_name"] == "Acme Holding"
    assert partial.json()["prepared_by"] == "Sam"

    assert client.delete(f"/selections/{sid}").status_code == 204
    assert client.get(f"/selections/{sid}").status_code == 404


def test_unknown_selection_id_is_404(client):
    assert client.get("/selections/does-not-exist").status_code == 404
    assert client.put("/selections/does-not-exist", json={"client_name": "X"}).status_code == 404
    assert client.delete("/selections/does-not-exist").status_code == 404


def test_duplicating_a_selection_is_independent_of_the_original(client):
    """The frontend duplicates by re-POSTing the current state under a new
    name — this pins that the two records don't share any mutable state."""
    buildings = _library_buildings(client)
    ids = [b["building_id"] for b in buildings[:2]]
    original = client.post("/selections", json={"client_name": "Acme BV", "building_ids": ids}).json()

    copy = client.post(
        "/selections", json={"client_name": "Acme BV (copy)", "building_ids": original["building_ids"]}
    ).json()
    assert copy["selection_id"] != original["selection_id"]

    client.put(f"/selections/{copy['selection_id']}", json={"building_ids": ids[:1]})

    reloaded_original = client.get(f"/selections/{original['selection_id']}").json()
    assert reloaded_original["building_ids"] == ids, "editing the copy must not affect the original"


def test_saving_a_selection_does_not_touch_the_library(client):
    buildings = _library_buildings(client)
    target = buildings[0]
    before = client.get(f"/buildings/{target['building_id']}").json()

    client.post("/selections", json={"client_name": "Acme BV", "building_ids": [target["building_id"]]})

    after = client.get(f"/buildings/{target['building_id']}").json()
    assert after == before


def test_rejects_missing_client_name(client):
    assert client.post("/selections", json={"building_ids": []}).status_code == 422
