"""Generic single-URL adapter for any permitted source without a bespoke
adapter yet. It has no search capability (discovery returns NO_RESULTS); given
a specific listing URL it fetches honestly and parses via the shared HTML
parser. Useful as the fallback the URL-import path can route through, and as
the template a new source-specific adapter starts from.
"""
from __future__ import annotations

from app.services.scraping.adapter import SearchParams, SourceAdapter
from app.services.scraping.normalized import (
    AccessStatus,
    DiscoveryResult,
    FetchResult,
    NormalizedListing,
)
from app.services.scraping.sources import http_client
from app.services.scraping.sources.html_parse import parse_listing_html


class GenericAdapter(SourceAdapter):
    source_name = "generic"
    display_name = "Generic (single URL)"

    def discover_listings(self, params: SearchParams) -> DiscoveryResult:
        # No search endpoint to discover from — callers supply explicit URLs.
        return DiscoveryResult(AccessStatus.NO_RESULTS, detail="generic adapter has no search")

    def fetch_listing(self, url: str) -> FetchResult:
        return http_client.fetch(url)

    def parse_listing(self, fetched: FetchResult) -> NormalizedListing | None:
        if fetched.status is not AccessStatus.SUCCESS or not fetched.body:
            return None
        return parse_listing_html(fetched.body, fetched.url, source=self.source_name)

    def health_check(self) -> AccessStatus:
        return AccessStatus.SUCCESS  # nothing source-specific to probe
