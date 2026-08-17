"""Maps in the availability PDF (the client-facing deliverable, not the
old/unreachable PPTX path) — a location map per building, and a numbered
portfolio-overview map matching the summary table's numbering.

Every network call is monkeypatched: these pin the flowable sizing math,
the numbering/legend pairing, and — most importantly — that a missing key,
missing coordinates, or a failed fetch degrades to "the section isn't
there" rather than an error or a leaked "map unavailable" placeholder in a
document that goes straight to a client.
"""
from __future__ import annotations

import io

from PIL import Image as PILImage
from reportlab.platypus import Image

from app.models import Building
from app.services.brochure import availability_pdf as mod
from app.services.brochure.availability_pdf import LibraryEntry, _map_flowable, _overview_legend, render_availability_pdf


def _tiny_png(width: int = 2, height: int = 1) -> bytes:
    """A genuinely valid PNG, so ImageReader.getSize() succeeds and
    exercises the real aspect-ratio math instead of a mocked one."""
    buf = io.BytesIO()
    PILImage.new("RGB", (width, height), color="red").save(buf, format="PNG")
    return buf.getvalue()


_TINY_PNG = _tiny_png()


def _building(**overrides) -> Building:
    defaults = dict(name="Test Building", address="Herengracht 206-216", city="Amsterdam", country="Netherlands")
    defaults.update(overrides)
    return Building(**defaults)


def test_map_flowable_returns_none_without_a_url():
    assert _map_flowable(None, width=100) is None


def test_map_flowable_returns_none_when_the_fetch_fails(monkeypatch):
    monkeypatch.setattr(mod, "fetch_static_map_image", lambda url: None)
    assert _map_flowable("https://maps.googleapis.com/maps/api/staticmap?x=1", width=100) is None


def test_map_flowable_preserves_aspect_ratio(monkeypatch):
    """2x1 source image at width=100 must come out height=50, not squashed
    to whatever height the caller happened to also pass in — there's no
    separate height parameter precisely so this can't drift out of sync."""
    monkeypatch.setattr(mod, "fetch_static_map_image", lambda url: _TINY_PNG)
    image = _map_flowable("https://maps.googleapis.com/maps/api/staticmap?x=1", width=100)
    assert isinstance(image, Image)
    assert image.drawWidth == 100
    assert image.drawHeight == 50


def test_overview_legend_pairs_numbers_with_addresses_in_order():
    buildings = [_building(address=f"Street {i}") for i in range(1, 4)]
    numbered = list(enumerate(buildings, start=1))
    table = _overview_legend(numbered, mod._styles())
    # Row 0: [1, "Street 1", 2, "Street 2"]; row 1: [3, "Street 3", "", ""]
    assert table._cellvalues[0][0].text == "1"
    assert table._cellvalues[0][1].text == "Street 1"
    assert table._cellvalues[0][2].text == "2"
    assert table._cellvalues[0][3].text == "Street 2"
    assert table._cellvalues[1][0].text == "3"
    assert table._cellvalues[1][1].text == "Street 3"


def test_pdf_includes_a_portfolio_overview_page_when_a_map_is_available(db_session, monkeypatch):
    monkeypatch.setattr(mod, "fetch_static_map_image", lambda url: _TINY_PNG)
    monkeypatch.setattr(mod, "build_region_map_url", lambda numbered, **kw: "https://example.com/region.png")
    monkeypatch.setattr(mod, "location_map_url", lambda building: "https://example.com/pin.png")

    entries = [LibraryEntry(building=_building(latitude=52.37, longitude=4.89))]
    with_maps = render_availability_pdf(db_session, client_name="Acme", entries=entries)

    monkeypatch.setattr(mod, "build_region_map_url", lambda numbered, **kw: None)
    monkeypatch.setattr(mod, "location_map_url", lambda building: None)
    without_maps = render_availability_pdf(db_session, client_name="Acme", entries=entries)

    assert with_maps.startswith(b"%PDF-")
    assert without_maps.startswith(b"%PDF-")
    # Two embedded map images (overview + one building) reliably outweighs a
    # PDF with none — a coarse but honest signal that they actually rendered
    # rather than being silently skipped.
    assert len(with_maps) > len(without_maps)


def test_pdf_generation_never_fails_when_a_building_has_no_coordinates(db_session):
    """location_map_url() itself returns None without lat/lon — the most
    common real case (an address not yet geocoded) — and that alone must
    not touch the network or raise."""
    entries = [LibraryEntry(building=_building())]  # no latitude/longitude at all
    pdf_bytes = render_availability_pdf(db_session, client_name="Acme", entries=entries)
    assert pdf_bytes.startswith(b"%PDF-")


def test_map_flowable_survives_an_unexpected_fetch_failure(monkeypatch):
    """fetch_static_map_image() already guarantees it never raises, but
    _map_flowable must not depend on every caller upholding that — belt and
    suspenders, matching _fetch_image's identical pattern above it."""

    def _boom(url):
        raise TimeoutError("map host unreachable")

    monkeypatch.setattr(mod, "fetch_static_map_image", _boom)
    assert _map_flowable("https://maps.googleapis.com/maps/api/staticmap?x=1", width=100) is None
