"""Cushman & Wakefield source adapter — placeholder until an authorized access route exists.
See pending.NotYetAvailableAdapter for the rationale; swap the body for a real
adapter when Cushman & Wakefield provides an authorized feed/API."""
from __future__ import annotations

from app.services.scraping.sources.pending import NotYetAvailableAdapter


class CushmanAdapter(NotYetAvailableAdapter):
    source_name = "cushman"
    display_name = "Cushman & Wakefield"
