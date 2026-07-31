"""Source registry — the one place that knows which adapters exist.

Add a source by writing an adapter and listing it here; nothing else in the
platform enumerates sources. `funda` and `generic` are real web adapters; the
broker sources are placeholders that report AUTH_REQUIRED until an authorized
access route is implemented (see pending.py).
"""
from __future__ import annotations

from app.services.scraping.adapter import SourceAdapter
from app.services.scraping.sources.cbre import CbreAdapter
from app.services.scraping.sources.cushman import CushmanAdapter
from app.services.scraping.sources.funda import FundaWebAdapter
from app.services.scraping.sources.generic import GenericAdapter
from app.services.scraping.sources.jll import JllAdapter
from app.services.scraping.sources.savills import SavillsAdapter

# Instantiated once; adapters are stateless.
_ADAPTERS: dict[str, SourceAdapter] = {
    a.source_name: a
    for a in (
        FundaWebAdapter(),
        CbreAdapter(),
        JllAdapter(),
        SavillsAdapter(),
        CushmanAdapter(),
        GenericAdapter(),
    )
}


def get_adapter(name: str) -> SourceAdapter | None:
    return _ADAPTERS.get(name)


def get_adapters(names: list[str] | None) -> list[SourceAdapter]:
    """Resolve requested source names to adapters, silently skipping unknown
    ones. None/empty means "every registered source except the generic
    single-URL helper" (which has no search and would just report NO_RESULTS)."""
    if not names:
        return [a for a in _ADAPTERS.values() if a.source_name != "generic"]
    return [_ADAPTERS[n] for n in names if n in _ADAPTERS]


def all_adapters() -> list[SourceAdapter]:
    return list(_ADAPTERS.values())
