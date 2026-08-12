"""Client folders — copying a library master building into a client's own,
independent set of rows (routers/buildings.py POST /{id}/copy-to-client,
services/building_copy.py). The point of these tests is independence: once
copied, editing either side must never affect the other, and the shared
library must never include a client's copies.
"""
from __future__ import annotations


def _seed_master(client):
    building = client.post(
        "/buildings",
        json={"name": "Original Tower", "address": "Zuidas 1", "city": "Amsterdam"},
    ).json()
    unit = client.post(
        "/units",
        json={"building_id": building["building_id"], "available_area_m2": 500},
    ).json()
    client.post(
        "/addons",
        json={"building_id": building["building_id"], "name": "Parking", "price": 100, "price_unit": "EUR/month"},
    )
    client.post(
        "/addons",
        json={"unit_id": unit["unit_id"], "name": "Fit-out", "price": 50, "price_unit": "EUR/month"},
    )
    return building, unit


def test_copy_to_client_creates_independent_building_and_units(client):
    building, unit = _seed_master(client)
    a_client = client.post("/clients", json={"name": "Acme BV"}).json()

    copy = client.post(
        f"/buildings/{building['building_id']}/copy-to-client",
        json={"client_id": a_client["client_id"]},
    )
    assert copy.status_code == 201
    copy = copy.json()

    assert copy["building_id"] != building["building_id"]
    assert copy["client_id"] == a_client["client_id"]
    assert copy["source_building_id"] == building["building_id"]
    assert len(copy["units"]) == 1
    assert copy["units"][0]["unit_id"] != unit["unit_id"]
    assert copy["units"][0]["available_area_m2"] == 500


def test_editing_the_copy_does_not_change_the_master_and_vice_versa(client):
    building, _ = _seed_master(client)
    a_client = client.post("/clients", json={"name": "Acme BV"}).json()
    copy = client.post(
        f"/buildings/{building['building_id']}/copy-to-client", json={"client_id": a_client["client_id"]}
    ).json()

    client.put(f"/buildings/{copy['building_id']}", json={**copy, "name": "Renamed For Client"})
    master_reloaded = client.get(f"/buildings/{building['building_id']}").json()
    assert master_reloaded["name"] == "Original Tower"

    client.put(f"/buildings/{building['building_id']}", json={**building, "name": "Master Renamed"})
    copy_reloaded = client.get(f"/buildings/{copy['building_id']}").json()
    assert copy_reloaded["name"] == "Renamed For Client"


def test_updating_a_copy_cannot_unscope_it_back_into_the_library(client):
    """update_building excludes client_id/source_building_id from the mass
    assignment — otherwise the edit form (which doesn't know about these
    fields) would silently null them out on every save."""
    building, _ = _seed_master(client)
    a_client = client.post("/clients", json={"name": "Acme BV"}).json()
    copy = client.post(
        f"/buildings/{building['building_id']}/copy-to-client", json={"client_id": a_client["client_id"]}
    ).json()

    payload = {**copy, "client_id": None, "source_building_id": None}
    client.put(f"/buildings/{copy['building_id']}", json=payload)

    reloaded = client.get(f"/buildings/{copy['building_id']}").json()
    assert reloaded["client_id"] == a_client["client_id"]
    assert reloaded["source_building_id"] == building["building_id"]


def test_library_listing_excludes_client_copies(client):
    building, _ = _seed_master(client)
    a_client = client.post("/clients", json={"name": "Acme BV"}).json()
    client.post(f"/buildings/{building['building_id']}/copy-to-client", json={"client_id": a_client["client_id"]})

    library = client.get("/buildings").json()
    assert building["building_id"] in [b["building_id"] for b in library]
    assert len(library) == 1


def test_client_folder_listing_only_shows_its_own_copies(client):
    building, _ = _seed_master(client)
    client_a = client.post("/clients", json={"name": "Acme BV"}).json()
    client_b = client.post("/clients", json={"name": "Beta BV"}).json()
    copy_a = client.post(
        f"/buildings/{building['building_id']}/copy-to-client", json={"client_id": client_a["client_id"]}
    ).json()

    folder_a = client.get("/buildings", params={"client_id": client_a["client_id"]}).json()
    folder_b = client.get("/buildings", params={"client_id": client_b["client_id"]}).json()

    assert [b["building_id"] for b in folder_a] == [copy_a["building_id"]]
    assert folder_b == []


def test_cannot_copy_a_copy(client):
    building, _ = _seed_master(client)
    client_a = client.post("/clients", json={"name": "Acme BV"}).json()
    copy_a = client.post(
        f"/buildings/{building['building_id']}/copy-to-client", json={"client_id": client_a["client_id"]}
    ).json()
    client_b = client.post("/clients", json={"name": "Beta BV"}).json()

    r = client.post(
        f"/buildings/{copy_a['building_id']}/copy-to-client", json={"client_id": client_b["client_id"]}
    )
    assert r.status_code == 400


def test_copy_to_client_404s_for_unknown_building_or_client(client):
    a_client = client.post("/clients", json={"name": "Acme BV"}).json()
    assert client.post(
        "/buildings/does-not-exist/copy-to-client", json={"client_id": a_client["client_id"]}
    ).status_code == 404

    building, _ = _seed_master(client)
    assert client.post(
        f"/buildings/{building['building_id']}/copy-to-client", json={"client_id": "does-not-exist"}
    ).status_code == 404


def test_deleting_a_client_cascades_its_copied_buildings(client):
    building, _ = _seed_master(client)
    a_client = client.post("/clients", json={"name": "Acme BV"}).json()
    copy = client.post(
        f"/buildings/{building['building_id']}/copy-to-client", json={"client_id": a_client["client_id"]}
    ).json()

    assert client.delete(f"/clients/{a_client['client_id']}").status_code == 204
    assert client.get(f"/buildings/{copy['building_id']}").status_code == 404
    assert client.get(f"/buildings/{building['building_id']}").status_code == 200
