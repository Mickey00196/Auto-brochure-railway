"""JLL source adapter — placeholder until an authorized access route exists.
See pending.NotYetAvailableAdapter for the rationale; swap the body for a real
adapter when JLL provides an authorized feed/API."""
from __future__ import annotations

from app.services.scraping.sources.pending import NotYetAvailableAdapter


class JllAdapter(NotYetAvailableAdapter):
    source_name = "jll"
    display_name = "JLL"
