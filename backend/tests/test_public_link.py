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


def _live_folder(client, **folder):
    building = client.post(
        "/buildings", json={"name": "De Walvis", "address": "Grote Bickersstraat 74-78", "city": "Amsterdam"}
    ).json()
    acme = client.post("/clients", json={"name": "Acme BV", **folder}).json()
    copy = client.post(
        f"/buildings/{building['building_id']}/copy-to-client", json={"client_id": acme["client_id"]}
    ).json()
    slug = client.post(f"/clients/{acme['client_id']}/live", json={"enable": True}).json()["public_slug"]
    return acme, copy, slug


def test_live_link_carries_language_contact_and_logo(client):
    acme, _, slug = _live_folder(
        client,
        brochure_language="nl",
        contact_name="Mick Siero",
        contact_role="Tenant representation",
        contact_phone="+31 6 12345678",
        contact_email="mick@example.test",
        logo_url="data:image/png;base64,iVBORw0KGgo=",
    )
    page = client.get(f"/public/clients/{slug}").json()
    assert page["language"] == "nl"
    assert page["contact_name"] == "Mick Siero"
    assert page["contact_role"] == "Tenant representation"
    assert page["contact_phone"] == "+31 6 12345678"
    assert page["contact_email"] == "mick@example.test"
    assert page["logo_url"].startswith("data:image/png")
    assert page["updated_at"]


def test_live_link_defaults_to_english(client):
    _, _, slug = _live_folder(client)
    page = client.get(f"/public/clients/{slug}").json()
    assert page["language"] == "en"
    assert page["contact_name"] is None


def test_saving_folder_name_keeps_the_live_link_settings(client):
    acme, _, slug = _live_folder(client, brochure_language="nl", contact_name="Mick Siero")
    # An edit that only knows the folder's own fields (as the older form sends).
    client.put(f"/clients/{acme['client_id']}", json={"name": "Acme Holding"})
    page = client.get(f"/public/clients/{slug}").json()
    assert page["display_name"] == "Acme Holding"
    assert page["language"] == "nl"
    assert page["contact_name"] == "Mick Siero"


def test_broker_notes_reach_the_live_link_and_survive_an_edit_without_them(client):
    _, copy, slug = _live_folder(client)
    base = {"name": "De Walvis", "address": "Grote Bickersstraat 74-78", "city": "Amsterdam"}
    client.put(
        f"/buildings/{copy['building_id']}",
        json={**base, "broker_note": "On the water, five minutes from Centraal.", "watch_out": "No rent quoted yet."},
    )
    client.put(f"/buildings/{copy['building_id']}", json={**base, "year_built": 1966})
    (b,) = client.get(f"/public/clients/{slug}").json()["buildings"]
    assert b["broker_note"] == "On the water, five minutes from Centraal."
    assert b["watch_out"] == "No rent quoted yet."
    assert b["year_built"] == 1966


def test_broker_notes_are_never_carried_into_a_new_folder(client):
    """Advice is written for one client. Even if a library master somehow has
    a note, adding it to a folder starts clean."""
    base = {"name": "De Walvis", "address": "Grote Bickersstraat 74-78", "city": "Amsterdam"}
    master = client.post("/buildings", json=base).json()
    client.put(f"/buildings/{master['building_id']}", json={**base, "broker_note": "For Acme only."})
    other = client.post("/clients", json={"name": "Other BV"}).json()
    copy = client.post(
        f"/buildings/{master['building_id']}/copy-to-client", json={"client_id": other["client_id"]}
    ).json()
    assert copy["broker_note"] is None
    assert copy["watch_out"] is None


def test_brochure_settings_endpoint_leaves_the_folder_alone(client):
    acme, _, slug = _live_folder(client, industry="Logistics")
    r = client.put(
        f"/clients/{acme['client_id']}/brochure",
        json={"brochure_language": "nl", "contact_name": " Mick Siero ", "contact_phone": "", "logo_url": None},
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Acme BV" and r.json()["industry"] == "Logistics"
    page = client.get(f"/public/clients/{slug}").json()
    assert page["language"] == "nl"
    assert page["contact_name"] == "Mick Siero"
    assert page["contact_phone"] is None


def test_notes_endpoint_only_for_client_copies(client):
    _, copy, slug = _live_folder(client)
    r = client.put(f"/buildings/{copy['building_id']}/notes", json={"broker_note": "Great light.", "watch_out": ""})
    assert r.status_code == 200
    (b,) = client.get(f"/public/clients/{slug}").json()["buildings"]
    assert b["broker_note"] == "Great light." and b["watch_out"] is None
    master = client.post("/buildings", json={"name": "X", "address": "Y 1", "city": "Amsterdam"}).json()
    assert client.put(f"/buildings/{master['building_id']}/notes", json={"broker_note": "no"}).status_code == 400
