"""CBRE source adapter — placeholder until an authorized access route exists.
See pending.NotYetAvailableAdapter for the rationale; swap the body for a real
adapter when CBRE provides an authorized feed/API."""
from __future__ import annotations

from app.services.scraping.sources.pending import NotYetAvailableAdapter


class CbreAdapter(NotYetAvailableAdapter):
    source_name = "cbre"
    display_name = "CBRE"
