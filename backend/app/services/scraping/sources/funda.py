"""Funda in Business source adapter (web).

This is `FundaWebAdapter`: it reaches Funda in Business only through ordinary,
honest HTTP requests (see http_client — identifiable UA, no stealth). Funda
runs anti-bot protection, so in practice `discover_listings`/`fetch_listing`
will often come back ACCESS_DENIED; that is reported truthfully and the source
is marked temporarily unavailable — there is deliberately no logic here to
defeat, disguise, or work around that protection.

The important design property is isolation: everything Funda-specific lives in
this one file behind the SourceAdapter interface. If Funda later offers an
authorized data feed/API, drop in a `FundaApiAdapter` implementing the same
interface and register it in place of this one — the normalizer, deduplicator,
database, and frontend do not change at all.
"""
from __future__ import annotations

from urllib.parse import quote

from app.services.scraping.adapter import SearchParams, SourceAdapter
from app.services.scraping.normalized import (
    AccessStatus,
    DiscoveryResult,
    FetchResult,
    NormalizedListing,
)
from app.services.scraping.sources import http_client
from app.services.scraping.sources.html_parse import parse_listing_html

_BASE = "https://www.fundainbusiness.nl"


class FundaWebAdapter(SourceAdapter):
    source_name = "funda"
    display_name = "Funda in Business"

    def _search_url(self, params: SearchParams) -> str:
        city = quote((params.city or "amsterdam").strip().lower())
        # "kantoor" = office. This is the site's ordinary public search path;
        # no private/undocumented endpoints are used.
        return f"{_BASE}/kantoor/{city}/"

    def discover_listings(self, params: SearchParams) -> DiscoveryResult:
        result = http_client.fetch(self._search_url(params))
        if result.status is not AccessStatus.SUCCESS:
            # ACCESS_DENIED here (the common case) propagates up so the source
            # is marked unavailable — we do not attempt to get around it.
            return DiscoveryResult(result.status, detail=result.detail)

        urls = self._extract_listing_links(result.body or "")
        if not urls:
            return DiscoveryResult(AccessStatus.NO_RESULTS)
        return DiscoveryResult(AccessStatus.SUCCESS, listing_urls=urls[: params.max_results])

    def fetch_listing(self, url: str) -> FetchResult:
        return http_client.fetch(url)

    def parse_listing(self, fetched: FetchResult) -> NormalizedListing | None:
        if fetched.status is not AccessStatus.SUCCESS or not fetched.body:
            return None
        listing = parse_listing_html(fetched.body, fetched.url, source=self.source_name)
        if listing:
            listing.source_listing_id = self._listing_id_from_url(fetched.url)
        return listing

    def health_check(self) -> AccessStatus:
        return http_client.fetch(f"{_BASE}/", timeout=10.0).status

    # -- helpers ----------------------------------------------------------
    @staticmethod
    def _extract_listing_links(html: str) -> list[str]:
        from bs4 import BeautifulSoup

        soup = BeautifulSoup(html, "html.parser")
        seen: list[str] = []
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if "/object-" in href:
                full = href if href.startswith("http") else _BASE + href
                if full not in seen:
                    seen.append(full)
        return seen

    @staticmethod
    def _listing_id_from_url(url: str) -> str | None:
        # …/object-43855117-claude-debussylaan-54/ -> "43855117"
        import re

        m = re.search(r"object-(\d+)", url)
        return m.group(1) if m else None
