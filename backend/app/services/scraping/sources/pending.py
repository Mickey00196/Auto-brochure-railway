"""Adapters for sources we intend to support but have no *authorized* automated
access route for yet. They exist so the source appears in the registry and the
health UI, and so the wiring is proven end-to-end — but they never scrape.
Every call reports AUTH_REQUIRED, i.e. "needs an authorized feed/API we don't
have", which the orchestrator surfaces as 'temporarily unavailable'. When an
authorized route exists, replace the subclass body with a real adapter (as
FundaWebAdapter → a future FundaApiAdapter) — nothing else changes.
"""
from __future__ import annotations

from app.services.scraping.adapter import SearchParams, SourceAdapter
from app.services.scraping.normalized import (
    AccessStatus,
    DiscoveryResult,
    FetchResult,
    NormalizedListing,
)


class NotYetAvailableAdapter(SourceAdapter):
    def discover_listings(self, params: SearchParams) -> DiscoveryResult:
        return DiscoveryResult(AccessStatus.AUTH_REQUIRED, detail="no authorized access route configured")

    def fetch_listing(self, url: str) -> FetchResult:
        return FetchResult(AccessStatus.AUTH_REQUIRED, url=url)

    def parse_listing(self, fetched: FetchResult) -> NormalizedListing | None:
        return None

    def health_check(self) -> AccessStatus:
        return AccessStatus.AUTH_REQUIRED
