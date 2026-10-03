"""The contract every source (Funda, CBRE, JLL, an authorized feed…) implements.

Adapters are the *only* source-specific code in the system. Everything else —
the orchestrator, normalizer, deduplicator, DB, frontend — talks to this
interface, so adding a source is "write one adapter and register it", and
replacing how an existing source is accessed (web scrape → authorized API) is
"swap one adapter", with no change anywhere else.

Kept synchronous to match the existing stack (sync FastAPI handlers, sync
SQLAlchemy, sync Playwright/httpx). The interface would translate 1:1 to async
if the app ever moves that way.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from app.services.scraping.normalized import (
    AccessStatus,
    DiscoveryResult,
    FetchResult,
    NormalizedListing,
)


class SearchParams:
    """The subset of an ingestion request an adapter needs to discover listings.
    A plain object (not pydantic) so adapters stay free of API-layer types."""

    def __init__(
        self,
        *,
        city: str | None = None,
        property_type: str = "office",
        min_area_sqm: float | None = None,
        max_area_sqm: float | None = None,
        max_results: int = 100,
    ) -> None:
        self.city = city
        self.property_type = property_type
        self.min_area_sqm = min_area_sqm
        self.max_area_sqm = max_area_sqm
        self.max_results = max_results


class SourceAdapter(ABC):
    """Implement all four methods. Return an `AccessStatus` honestly — the
    orchestrator relies on it to decide retry-vs-give-up, and correct
    reporting of ACCESS_DENIED/AUTH_REQUIRED is what keeps this system on the
    right side of "use permitted access, don't circumvent blocks"."""

    #: Stable identifier stored on every listing and health record.
    source_name: str = "base"
    #: Human-facing label for the UI.
    display_name: str = "Base"

    @abstractmethod
    def discover_listings(self, params: SearchParams) -> DiscoveryResult:
        """Find listing URLs/IDs matching the search, via the source's
        permitted mechanism. Return ACCESS_DENIED/AUTH_REQUIRED (not a raised
        exception) if the source refuses automated access."""

    @abstractmethod
    def fetch_listing(self, url: str) -> FetchResult:
        """Retrieve one listing's raw payload (HTML or API body)."""

    @abstractmethod
    def parse_listing(self, fetched: FetchResult) -> NormalizedListing | None:
        """Turn a successful FetchResult into a NormalizedListing. Return None
        (and the orchestrator records a PARSING_ERROR) if the payload can't be
        parsed — never fabricate fields to fill gaps."""

    @abstractmethod
    def health_check(self) -> AccessStatus:
        """Cheap probe of whether the source is currently reachable under its
        permitted access mechanism."""
