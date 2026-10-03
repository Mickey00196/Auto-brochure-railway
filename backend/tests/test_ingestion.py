"""Step 17 — upsert/history, retry logic, and access-failure classification."""
from __future__ import annotations

import httpx

from app.models.building import Building
from app.models.listing import Listing, ListingPriceHistory
from app.services import ingestion_service as ing
from app.services.scraping.normalized import (
    AccessStatus,
    DiscoveryResult,
    FetchResult,
    NormalizedListing,
)
from app.services.scraping.sources import http_client


def _n(**kw) -> NormalizedListing:
    base = dict(source="funda", source_url="http://x/object-1", source_listing_id="1",
                street="Keizersgracht", house_number="100", city="Amsterdam",
                asking_rent=300.0, available_area_sqm=500.0)
    base.update(kw)
    return NormalizedListing(**base)


# ── upsert + change history (Step 7) ──────────────────────────────────────
def test_upsert_creates_listing_building_and_history(db_session):
    assert ing._upsert_listing(db_session, _n()) == "created"
    db_session.commit()
    assert db_session.query(Listing).count() == 1
    assert db_session.query(Building).count() == 1  # new address -> building created
    assert db_session.query(ListingPriceHistory).count() == 1


def test_second_identical_upsert_is_unchanged(db_session):
    ing._upsert_listing(db_session, _n())
    db_session.commit()
    assert ing._upsert_listing(db_session, _n()) == "unchanged"
    db_session.commit()
    assert db_session.query(ListingPriceHistory).count() == 1  # no new history row


def test_rent_change_updates_and_records_history(db_session):
    ing._upsert_listing(db_session, _n())
    db_session.commit()
    assert ing._upsert_listing(db_session, _n(asking_rent=275.0)) == "updated"
    db_session.commit()
    listing = db_session.query(Listing).one()
    assert listing.asking_rent == 275.0
    history = db_session.query(ListingPriceHistory).order_by(ListingPriceHistory.changed_at).all()
    assert len(history) == 2
    assert history[-1].change_type == "rent" and history[-1].asking_rent == 275.0


def test_upsert_links_to_existing_building_without_duplicating(db_session):
    db_session.add(Building(name="Existing", address="Keizersgracht 100, Amsterdam", city="Amsterdam"))
    db_session.commit()
    ing._upsert_listing(db_session, _n())
    db_session.commit()
    assert db_session.query(Building).count() == 1  # matched, not duplicated
    assert db_session.query(Listing).one().building_id is not None


# ── retry/backoff: transient retried, refusal not (Step 6) ────────────────
def test_with_retry_retries_transient_then_succeeds(monkeypatch):
    monkeypatch.setattr(ing.time, "sleep", lambda *_: None)
    calls = {"n": 0}

    def flaky():
        calls["n"] += 1
        if calls["n"] < 2:
            return FetchResult(AccessStatus.TEMPORARY_ERROR)
        return FetchResult(AccessStatus.SUCCESS, body="ok")

    result = ing._with_retry(flaky)
    assert result.status is AccessStatus.SUCCESS and calls["n"] == 2


def test_with_retry_does_not_retry_access_denied(monkeypatch):
    monkeypatch.setattr(ing.time, "sleep", lambda *_: None)
    calls = {"n": 0}

    def blocked():
        calls["n"] += 1
        return DiscoveryResult(AccessStatus.ACCESS_DENIED)

    result = ing._with_retry(blocked)
    assert result.status is AccessStatus.ACCESS_DENIED and calls["n"] == 1  # tried once, gave up


def test_with_retry_caps_attempts(monkeypatch):
    monkeypatch.setattr(ing.time, "sleep", lambda *_: None)
    calls = {"n": 0}

    def always_transient():
        calls["n"] += 1
        return FetchResult(AccessStatus.TEMPORARY_ERROR)

    ing._with_retry(always_transient)
    assert calls["n"] == ing._MAX_ATTEMPTS


# ── access-failure classification (Step 6) ────────────────────────────────
def _resp(status_code: int, text: str = "hi") -> httpx.Response:
    return httpx.Response(status_code, text=text, request=httpx.Request("GET", "http://x"))


def test_classify_404():
    assert http_client.classify_and_wrap("http://x", _resp(404)).status is AccessStatus.NOT_FOUND


def test_classify_403_is_access_denied():
    assert http_client.classify_and_wrap("http://x", _resp(403)).status is AccessStatus.ACCESS_DENIED


def test_classify_429_is_rate_limited():
    assert http_client.classify_and_wrap("http://x", _resp(429)).status is AccessStatus.RATE_LIMITED


def test_classify_500_is_temporary():
    assert http_client.classify_and_wrap("http://x", _resp(503)).status is AccessStatus.TEMPORARY_ERROR


def test_classify_interstitial_is_access_denied():
    html = "<html><title>Je bent bijna op de pagina die je zoekt [funda]</title></html>"
    result = http_client.classify_and_wrap("http://x", _resp(200, html))
    assert result.status is AccessStatus.ACCESS_DENIED  # 200 but blocked content


def test_classify_real_page_is_success():
    result = http_client.classify_and_wrap("http://x", _resp(200, "<html>real listing</html>"))
    assert result.status is AccessStatus.SUCCESS and result.body


def test_blocked_fetch_parses_to_none():
    from app.services.scraping.sources.funda import FundaWebAdapter

    denied = FetchResult(AccessStatus.ACCESS_DENIED, url="http://x")
    assert FundaWebAdapter().parse_listing(denied) is None  # no fabricated data on a block
