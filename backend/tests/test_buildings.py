"""Deleting a building — the point of these is the cascade: units and their
add-ons must go with it, and every reference that lives outside the ORM
relationship (a legacy Proposal's unit links, a saved Selection's
building_ids, a Listing's pointer) must be cleaned up rather than left
dangling, since a stale foreign key is a hard failure on Postgres even
though SQLite (used here) doesn't enforce it.
"""
from __future__ import annotations


def test_deletes_a_building_and_its_units(client):
    r = client.post("/seed/demo")
    buildings = client.get("/buildings").json()
    target = buildings[0]
    unit_ids = [u["unit_id"] for u in target["units"]]
    assert unit_ids, "fixture assumption: the seeded building has units"

    assert client.delete(f"/buildings/{target['building_id']}").status_code == 204
    assert client.get(f"/buildings/{target['building_id']}").status_code == 404
    for uid in unit_ids:
        assert client.get(f"/units/{uid}").status_code == 404


def test_deleting_a_building_does_not_orphan_the_legacy_proposal_links(client):
    """The demo seed creates a Proposal that links to this building's units
    via ProposalUnit. Deleting the building must not leave those link rows
    pointing at a unit_id that no longer exists — that's a foreign-key
    violation on Postgres, just a silent orphan on SQLite."""
    seeded = client.post("/seed/demo").json()
    proposal_id = seeded["proposal_id"]
    buildings = client.get("/buildings").json()
    target = next(b for b in buildings if b["units"])

    client.delete(f"/buildings/{target['building_id']}")

    proposal = client.get(f"/proposals/{proposal_id}").json()
    remaining_unit_ids = {u["unit_id"] for u in proposal["selected_units"]}
    assert not remaining_unit_ids & {u["unit_id"] for u in target["units"]}


def test_deleting_a_building_prunes_it_from_saved_selections(client):
    buildings = _library_buildings(client)
    ids = [b["building_id"] for b in buildings[:2]]
    selection = client.post("/selections", json={"client_name": "Acme BV", "building_ids": ids}).json()

    client.delete(f"/buildings/{ids[0]}")

    reloaded = client.get(f"/selections/{selection['selection_id']}").json()
    assert reloaded["building_ids"] == ids[1:]


def test_deleting_an_unknown_building_is_404(client):
    assert client.delete("/buildings/does-not-exist").status_code == 404


def _library_buildings(client) -> list[dict]:
    client.post("/seed/demo")
    return client.get("/buildings").json()
