"""The client's live link (GET /public/clients/{slug}) — what a recipient
without an account sees for each building on their shortlist."""
from __future__ import annotations


def test_live_link_shows_building_facts_and_parking_price(client):
    building = client.post(
        "/buildings",
        json={
            "name": "Danzigerkade 13-G",
            "address": "Danzigerkade 13-G",
            "city": "Amsterdam",
            "year_built": 2004,
            "total_building_area_m2": 4200,
            "breeam_rating": "Very Good",
        },
    ).json()
    unit = client.post(
        "/units",
        json={"building_id": building["building_id"], "floor": "Ground floor", "available_area_m2": 280},
    ).json()
    client.post(
        "/addons",
        json={
            "building_id": building["building_id"],
            "unit_id": unit["unit_id"],
            "name": "Parking space",
            "price": 1750,
            "price_unit": "EUR / space / year",
        },
    )
    acme = client.post("/clients", json={"name": "Acme BV"}).json()
    client.post(f"/buildings/{building['building_id']}/copy-to-client", json={"client_id": acme["client_id"]})
    slug = client.post(f"/clients/{acme['client_id']}/live", json={"enable": True}).json()["public_slug"]

    page = client.get(f"/public/clients/{slug}")
    assert page.status_code == 200
    (b,) = page.json()["buildings"]
    assert b["year_built"] == 2004
    assert b["total_building_area_m2"] == 4200
    assert b["breeam_rating"] == "Very Good"
    assert [u["floor"] for u in b["units"]] == ["Ground floor"]
    assert {"name": "Parking space", "price": 1750, "price_unit": "EUR / space / year"} in b["addons"]
    # Only what a recipient needs: no ids or links back into the broker's data.
    assert all(set(a) == {"name", "price", "price_unit"} for a in b["addons"])


def test_live_link_is_404_once_turned_off(client):
    acme = client.post("/clients", json={"name": "Acme BV"}).json()
    slug = client.post(f"/clients/{acme['client_id']}/live", json={"enable": True}).json()["public_slug"]
    assert client.get(f"/public/clients/{slug}").status_code == 200
    client.post(f"/clients/{acme['client_id']}/live", json={"enable": False})
    assert client.get(f"/public/clients/{slug}").status_code == 404
