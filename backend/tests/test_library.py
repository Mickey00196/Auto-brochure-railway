"""Step 4 of the core workflow: selected buildings → client PDF.

The point of these tests is the reuse guarantee: generating a PDF must not
require (or create) Client/Proposal records, must not mutate the library,
and the same building must be usable for any number of clients.
"""
from __future__ import annotations


def _library_buildings(client) -> list[dict]:
    client.post("/seed/demo")
    return client.get("/buildings").json()


def test_generates_pdf_from_selected_buildings_without_a_client_record(client):
    buildings = _library_buildings(client)
    ids = [b["building_id"] for b in buildings[:2]]

    r = client.post("/library/pdf", json={"client_name": "Acme BV", "building_ids": ids})

    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF-")
    assert len(r.content) > 2000
    # No Client record was needed or created — the client only exists on the cover.
    assert all(c["company_name"] != "Acme BV" for c in client.get("/clients").json())


def test_same_building_is_reusable_across_clients_and_is_never_mutated(client):
    buildings = _library_buildings(client)
    target = buildings[0]
    before = client.get(f"/buildings/{target['building_id']}").json()

    for name in ("Client One", "Client Two", "Client Three"):
        r = client.post("/library/pdf", json={"client_name": name, "building_ids": [target["building_id"]]})
        assert r.status_code == 200

    after = client.get(f"/buildings/{target['building_id']}").json()
    assert after == before, "generating a PDF must never alter the stored building"


def test_selection_order_is_preserved(client):
    buildings = _library_buildings(client)
    ids = [b["building_id"] for b in buildings[:3]]
    forward = client.post("/library/pdf", json={"client_name": "Order Test", "building_ids": ids})
    reverse = client.post("/library/pdf", json={"client_name": "Order Test", "building_ids": list(reversed(ids))})
    assert forward.status_code == reverse.status_code == 200
    # Same buildings, different order → genuinely different documents.
    assert forward.content != reverse.content


def test_rejects_empty_selection_and_missing_client_name(client):
    buildings = _library_buildings(client)
    ids = [buildings[0]["building_id"]]
    assert client.post("/library/pdf", json={"client_name": "Acme", "building_ids": []}).status_code == 422
    assert client.post("/library/pdf", json={"client_name": "", "building_ids": ids}).status_code == 422


def test_unknown_building_ids_are_skipped_not_fatal(client):
    buildings = _library_buildings(client)
    ids = [buildings[0]["building_id"], "does-not-exist"]
    r = client.post("/library/pdf", json={"client_name": "Acme", "building_ids": ids})
    assert r.status_code == 200
    assert r.content.startswith(b"%PDF-")


def test_building_with_no_units_still_renders(client):
    """A capture without lease terms is still a library entry a broker may
    want to show — it must not crash or be silently dropped."""
    created = client.post(
        "/buildings",
        json={"name": "Bare Capture", "address": "Leegstraat 1", "city": "Amsterdam", "total_building_area_m2": 300},
    ).json()
    r = client.post("/library/pdf", json={"client_name": "Acme", "building_ids": [created["building_id"]]})
    assert r.status_code == 200
    assert r.content.startswith(b"%PDF-")
