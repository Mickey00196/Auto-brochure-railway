"""A plain, honest HTTP fetch for adapters that scrape a permitted web source.

Deliberately *not* stealthy: it sends an identifiable User-Agent, follows
redirects, respects the response it gets, and classifies that response into an
AccessStatus. If a site blocks it, that block is reported (ACCESS_DENIED) and
the orchestrator moves on — there is intentionally no fingerprint spoofing,
proxy rotation, CAPTCHA handling, or interstitial-defeating logic here, and
none should be added. The point of the platform is to consume sources that
permit automated access, not to get past ones that don't.
"""
from __future__ import annotations

import os

import httpx

from app.services.scraping.normalized import AccessStatus, FetchResult

# Identifies the client honestly. Override via env if a source asks you to use
# a specific agent string as part of its permitted-access terms.
USER_AGENT = os.environ.get(
    "INGEST_USER_AGENT",
    "AutoBrochureBot/1.0 (CRE listing ingestion; contact: set INGEST_CONTACT)",
)

# Phrases that indicate a soft block / anti-bot interstitial served with a 200
# status instead of the real content. Detecting these lets us report
# ACCESS_DENIED honestly rather than storing an interstitial as if it were a
# listing — it is NOT used to try again or work around the block.
_BLOCK_MARKERS = (
    "je bent bijna op de pagina die je zoekt",
    "even geduld",
    "checking your browser",
    "verify you are human",
    "captcha",
    "access denied",
    "request blocked",
)


def classify_and_wrap(url: str, response: httpx.Response) -> FetchResult:
    code = response.status_code
    if code == 404:
        return FetchResult(AccessStatus.NOT_FOUND, url=url)
    if code == 401:
        return FetchResult(AccessStatus.AUTH_REQUIRED, url=url, detail="401")
    if code == 403:
        return FetchResult(AccessStatus.ACCESS_DENIED, url=url, detail="403")
    if code == 429:
        return FetchResult(AccessStatus.RATE_LIMITED, url=url, detail="429")
    if 500 <= code < 600:
        return FetchResult(AccessStatus.TEMPORARY_ERROR, url=url, detail=str(code))
    if code != 200:
        return FetchResult(AccessStatus.UNKNOWN_ERROR, url=url, detail=str(code))

    body = response.text
    lowered = body[:5000].lower()
    if any(marker in lowered for marker in _BLOCK_MARKERS):
        return FetchResult(
            AccessStatus.ACCESS_DENIED,
            url=url,
            detail="anti-bot interstitial served instead of content",
        )
    return FetchResult(AccessStatus.SUCCESS, url=url, body=body)


def fetch(url: str, *, timeout: float = 15.0) -> FetchResult:
    """GET `url` once, honestly, and classify the outcome. Transient network
    failures map to TEMPORARY_ERROR (the orchestrator handles backoff/retry);
    this function itself does not retry."""
    try:
        response = httpx.get(
            url,
            headers={"User-Agent": USER_AGENT, "Accept-Language": "nl,en;q=0.8"},
            follow_redirects=True,
            timeout=timeout,
        )
    except httpx.TimeoutException:
        return FetchResult(AccessStatus.TEMPORARY_ERROR, url=url, detail="timeout")
    except httpx.HTTPError as e:
        return FetchResult(AccessStatus.TEMPORARY_ERROR, url=url, detail=str(e))
    return classify_and_wrap(url, response)
