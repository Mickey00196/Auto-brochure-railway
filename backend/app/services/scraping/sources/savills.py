"""Savills source adapter — placeholder until an authorized access route exists.
See pending.NotYetAvailableAdapter for the rationale; swap the body for a real
adapter when Savills provides an authorized feed/API."""
from __future__ import annotations

from app.services.scraping.sources.pending import NotYetAvailableAdapter


class SavillsAdapter(NotYetAvailableAdapter):
    source_name = "savills"
    display_name = "Savills"
