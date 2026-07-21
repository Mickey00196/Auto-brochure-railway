"""API-level smoke tests covering Workflow 1 (§4) end-to-end through the
FastAPI layer, plus the §8 QA export gate."""
from __future__ import annotations


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_seed_demo_creates_proposal(client):
    r = client.post("/seed/demo")
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "Office Shortlist · Amsterdam 2026"
    assert len(body["selected_unit_ids"]) == 8


def test_comparison_endpoint_sorted_and_computed(client):
    proposal = client.post("/seed/demo").json()
    rows = client.get(f"/proposals/{proposal['proposal_id']}/comparison").json()
    assert len(rows) == 8
    ready_per_sqm = [r for r in rows if not r["is_tbd"] and r["pricing_model"] == "per_sqm_annual"]
    rates = [r["all_in_rate_eur_per_m2_year"] for r in ready_per_sqm]
    assert rates == sorted(rates)


def test_qa_endpoint_reports_not_export_ready(client):
    proposal = client.post("/seed/demo").json()
    qa = client.get(f"/proposals/{proposal['proposal_id']}/qa").json()
    assert qa["is_export_ready"] is False
    assert qa["blocking_count"] > 0


def test_export_pdf_blocked_without_force(client):
    proposal = client.post("/seed/demo").json()
    r = client.post(f"/proposals/{proposal['proposal_id']}/export/pdf")
    assert r.status_code == 409


def test_export_pdf_succeeds_with_force(client):
    proposal = client.post("/seed/demo").json()
    r = client.post(f"/proposals/{proposal['proposal_id']}/export/pdf?force=true")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert len(r.content) > 1000


def test_create_proposal_selects_units_in_order(client):
    client.post("/seed/demo")
    buildings = client.get("/buildings").json()
    unit_ids = [u["unit_id"] for b in buildings for u in b["units"]][:3]
    clients_ = client.get("/clients").json()
    client_id = clients_[0]["client_id"]

    r = client.post(
        "/proposals",
        json={"client_id": client_id, "title": "Custom Shortlist", "unit_ids": unit_ids},
    )
    assert r.status_code == 201
    assert r.json()["selected_unit_ids"] == unit_ids


def test_match_endpoint_scores_units_by_criteria(client):
    client.post("/seed/demo")
    r = client.post("/match", json={"city": "Amsterdam", "size_m2_min": 100, "size_m2_max": 700})
    assert r.status_code == 200
    results = r.json()
    assert len(results) == 8
    assert all(0 <= result["score"] <= 1 for result in results)


def test_dashboard_reports_data_completeness(client):
    client.post("/seed/demo")
    dashboard = client.get("/dashboard").json()
    assert dashboard["imported_properties"]["units"] == 8
    assert dashboard["data_completeness"]["tbd_field_count"] > 0
