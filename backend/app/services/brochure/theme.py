"""§22 Design — white-labelable per brokerage/tenant-rep firm.

The reference brochure's own palette (near-black title cards, single red
accent, white detail pages) is the default, not a hard-coded look — pass a
different Theme into the generators to reskin per tenant.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Theme:
    name: str
    dark_bg_hex: str
    accent_hex: str
    text_on_dark_hex: str
    text_on_light_hex: str
    light_bg_hex: str
    muted_text_hex: str
    font_family: str = "Calibri"


DEFAULT_THEME = Theme(
    name="Default (near-black / red accent)",
    dark_bg_hex="0B0B0C",
    accent_hex="C8102E",
    text_on_dark_hex="FFFFFF",
    text_on_light_hex="17171A",
    light_bg_hex="FFFFFF",
    muted_text_hex="6B6B70",
)
