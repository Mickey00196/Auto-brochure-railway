"""The source-agnostic intermediate representation every adapter produces.

A source adapter's whole job is: turn whatever a permitted source exposes into
a `NormalizedListing`. Everything downstream — deduplication, the DB upsert,
change history, the frontend — depends only on this shape, never on any one
source's markup or API. That's what lets a `FundaWebAdapter` be swapped for a
future `FundaAPIAdapter` without touching anything else (see the module docs
in sources/funda.py).

Nothing here fabricates values: a field the source didn't expose stays `None`
(stored as NULL), never guessed.
"""
from __future__ import annotations

import enum
from dataclasses import dataclass, field
from datetime import datetime


class AccessStatus(str, enum.Enum):
    """Outcome of an attempt to reach a source, so the orchestrator can react
    correctly — retry transient errors with backoff, but never hammer (or try
    to defeat) a source that is deliberately refusing automated access."""

    SUCCESS = "success"
    NO_RESULTS = "no_results"
    NOT_FOUND = "not_found"           # a specific listing/URL is gone (404)
    RATE_LIMITED = "rate_limited"     # transient — back off and retry
    ACCESS_DENIED = "access_denied"   # blocked/forbidden — do NOT retry, mark unavailable
    AUTH_REQUIRED = "auth_required"   # needs authorized credentials we don't have — mark unavailable
    TEMPORARY_ERROR = "temporary_error"  # transient — back off and retry
    PARSING_ERROR = "parsing_error"   # reached the content but couldn't parse it
    UNKNOWN_ERROR = "unknown_error"


# Statuses worth retrying with exponential backoff (genuinely transient). An
# ACCESS_DENIED / AUTH_REQUIRED is a deliberate refusal, not a blip — retrying
# it is both pointless and the wrong thing to do, so it is NOT in this set.
RETRYABLE_STATUSES = frozenset({AccessStatus.RATE_LIMITED, AccessStatus.TEMPORARY_ERROR})


@dataclass
class DiscoveryResult:
    """What `SourceAdapter.discover_listings` returns: the access outcome plus,
    on success, the listing URLs/IDs to fetch next."""

    status: AccessStatus
    listing_urls: list[str] = field(default_factory=list)
    detail: str | None = None


@dataclass
class FetchResult:
    """What `SourceAdapter.fetch_listing` returns: the access outcome plus, on
    success, the raw payload (HTML or an API JSON body) for `parse_listing`."""

    status: AccessStatus
    url: str = ""
    body: str | None = None
    detail: str | None = None


@dataclass
class NormalizedListing:
    """Source-agnostic listing. Field names mirror the ingestion spec; units
    are carried explicitly (asking_rent_unit etc.) rather than assumed, since
    sources differ. `None` means "not exposed", never "zero"."""

    source: str
    source_url: str
    source_listing_id: str | None = None

    # Property (the underlying building)
    building_name: str | None = None
    address: str | None = None
    street: str | None = None
    house_number: str | None = None
    postal_code: str | None = None
    city: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    construction_year: int | None = None
    energy_label: str | None = None

    # Availability (the space)
    available_area_sqm: float | None = None
    min_area_sqm: float | None = None
    max_area_sqm: float | None = None
    floor: str | None = None
    availability_date: str | None = None

    # Financial
    asking_rent: float | None = None
    asking_rent_unit: str | None = None      # e.g. "EUR/m2/year"
    asking_rent_period: str | None = None    # e.g. "year"
    service_charge: float | None = None
    service_charge_unit: str | None = None
    parking_available: bool | None = None
    parking_spaces: int | None = None
    parking_price: float | None = None

    # Marketing
    title: str | None = None
    description: str | None = None
    amenities: list[str] = field(default_factory=list)
    image_urls: list[str] = field(default_factory=list)
    floorplan_urls: list[str] = field(default_factory=list)

    # Broker
    broker_name: str | None = None
    broker_phone: str | None = None
    broker_email: str | None = None
    broker_url: str | None = None

    # Source metadata
    scraped_at: datetime | None = None
