"""The capture page's "Update" merges a fresh capture into a building that's
already in the library: it sends back the stored record (as GET returned it,
read-only fields stripped) with the captured values laid over it."""


def test_update_with_a_merged_record_keeps_what_the_capture_did_not_state(client):
    b = client.post("/buildings", json={
        "name": "Hildegard von Bingenstraat 8", "address": "Hildegard von Bingenstraat 8", "city": "Amsterdam",
        "description": "Hand-written description", "year_built": 2003, "photos": ["p1"],
    }).json()
    unit = client.post("/units", json={"building_id": b["building_id"], "floor": "3e verdieping",
                                       "available_area_m2": 300, "rent_eur_per_m2_year": 300}).json()

    stored = client.get(f"/buildings/{b['building_id']}").json()
    merged = {k: v for k, v in stored.items() if k not in ("building_id", "created_at", "updated_at", "units")}
    merged.update({"energy_label": "A", "photos": ["p1", "p2"]})
    r = client.put(f"/buildings/{b['building_id']}", json=merged)
    assert r.status_code == 200, r.text
    after = r.json()
    assert after["description"] == "Hand-written description"
    assert after["year_built"] == 2003
    assert after["energy_label"] == "A"
    assert after["photos"] == ["p1", "p2"]

    u = {k: v for k, v in unit.items() if k not in ("unit_id", "created_at", "updated_at")}
    u.update({"available_area_m2": 341, "availability": "Per direct"})
    r = client.put(f"/units/{unit['unit_id']}", json=u)
    assert r.status_code == 200, r.text
    assert r.json()["rent_eur_per_m2_year"] == 300
    assert r.json()["available_area_m2"] == 341

    addon = client.post("/addons", json={"name": "Parking space", "price": 3500, "price_unit": "EUR / space / year",
                                         "unit_id": unit["unit_id"], "building_id": b["building_id"]}).json()
    assert client.delete(f"/addons/{addon['addon_id']}").status_code == 204
