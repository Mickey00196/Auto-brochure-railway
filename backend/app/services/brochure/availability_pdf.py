"""Client-facing availability overview, rendered straight to PDF.

This is the tool's deliverable: pick buildings out of the library, name the
client, get a PDF — a total overview on page 1, then one detail page per
building.

It is deliberately *not* the PPTX→LibreOffice path (pdf_export.py): that
conversion needs a working `soffice` binary on the host, and when the host
doesn't have one the user's main output simply fails. ReportLab is a
pure-Python dependency, so this works on any deployment that can run the app.

Unknown values render as "TBD" rather than blocking the document — an
overview of what's available is still useful (and often exactly what a
broker sends) while a few figures are still being chased down.
"""
from __future__ import annotations

import io
from dataclasses import dataclass, field
from datetime import date

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy.orm import Session

from app.models import AddOn, Building, Proposal, Unit
from app.services.comparison import build_comparison_row

# Deep navy leads, vivid blue accents — matching the app's palette.
ACCENT = colors.HexColor("#0F2557")
HIGHLIGHT = colors.HexColor("#1D4ED8")
INK = colors.HexColor("#0F1E3D")
MUTED = colors.HexColor("#64748B")
RULE = colors.HexColor("#DCE3F0")
BAND = colors.HexColor("#F4F6FB")

PHOTO_TIMEOUT_SECONDS = 6


@dataclass
class LibraryEntry:
    """One building as it appears in a client PDF, with whichever of its
    units are in scope (all of them for a library selection; only the
    selected ones when generated from a Proposal)."""

    building: Building
    units: list[Unit] = field(default_factory=list)


def _fmt_rate(value: float | None, suffix: str = "m²/yr") -> str:
    return f"€{value:,.0f} / {suffix}" if value is not None else "TBD"


def _fmt_area(value: float | None) -> str:
    return f"{value:,.0f} m²" if value is not None else "TBD"


def _fmt_rate_range(values: list[float | None]) -> str:
    """A building can hold several units at different rents — show the span
    rather than silently picking one of them."""
    known = sorted({v for v in values if v is not None})
    if not known:
        return "TBD"
    if len(known) == 1:
        return _fmt_rate(known[0])
    return f"€{known[0]:,.0f}–€{known[-1]:,.0f} / m²/yr"


def _fetch_image(url: str) -> ImageReader | None:
    """Best-effort listing photo. Never raises: a slow or dead image host
    must not take the whole document down with it."""
    if not url or not url.startswith(("http://", "https://")):
        return None
    try:
        import urllib.request

        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=PHOTO_TIMEOUT_SECONDS) as resp:
            data = resp.read(6_000_000)
        return ImageReader(io.BytesIO(data))
    except Exception:
        return None


def _styles() -> dict:
    base = getSampleStyleSheet()
    return {
        "eyebrow": ParagraphStyle("eyebrow", parent=base["Normal"], fontName="Helvetica-Bold",
                                  fontSize=8.5, textColor=HIGHLIGHT, spaceAfter=2, leading=11),
        "h1": ParagraphStyle("h1", parent=base["Normal"], fontName="Helvetica-Bold",
                             fontSize=26, textColor=INK, leading=30, spaceAfter=4),
        "h2": ParagraphStyle("h2", parent=base["Normal"], fontName="Helvetica-Bold",
                             fontSize=13, textColor=INK, leading=16, spaceBefore=2, spaceAfter=4),
        "meta": ParagraphStyle("meta", parent=base["Normal"], fontName="Helvetica",
                               fontSize=9.5, textColor=MUTED, leading=13),
        "body": ParagraphStyle("body", parent=base["Normal"], fontName="Helvetica",
                               fontSize=9, textColor=INK, leading=12.5, alignment=TA_LEFT),
        "cell": ParagraphStyle("cell", parent=base["Normal"], fontName="Helvetica",
                               fontSize=8.5, textColor=INK, leading=11),
        "cellhead": ParagraphStyle("cellhead", parent=base["Normal"], fontName="Helvetica-Bold",
                                   fontSize=8.5, textColor=colors.white, leading=11),
        "cellsm": ParagraphStyle("cellsm", parent=base["Normal"], fontName="Helvetica",
                                 fontSize=7, textColor=INK, leading=9),
    }


def _header_footer(canvas, doc, client_name: str):
    canvas.saveState()
    canvas.setFillColor(ACCENT)
    canvas.rect(0, A4[1] - 6 * mm, A4[0], 6 * mm, stroke=0, fill=1)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 12 * mm, f"Availability overview · {client_name}")
    canvas.drawRightString(A4[0] - 18 * mm, 12 * mm, f"Page {canvas.getPageNumber()}")
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.5)
    canvas.line(18 * mm, 16 * mm, A4[0] - 18 * mm, 16 * mm)
    canvas.restoreState()


def _entry_rows(entry: LibraryEntry) -> list:
    return [build_comparison_row(u) for u in entry.units]


def _summary_table(entries: list[LibraryEntry], st: dict) -> Table:
    """Page 1: one row per building, in the order the user selected them."""
    head = ["#", "Address", "Available", "Rent", "Service ch.", "All-in", "From", "Amenities"]
    data = [[Paragraph(h, st["cellhead"]) for h in head]]
    for i, entry in enumerate(entries, start=1):
        b = entry.building
        rows = _entry_rows(entry)
        area = sum(u.available_area_m2 for u in entry.units) if entry.units else b.total_building_area_m2
        availability = next((u.availability for u in entry.units if u.availability), None)
        smallest = min(
            (u.min_divisible_area_m2 for u in entry.units if u.min_divisible_area_m2), default=None
        )
        area_cell = _fmt_area(area)
        if smallest:
            area_cell += f'<br/><font size="6.5" color="#64748B">from {smallest:,.0f} m²</font>'
        data.append([
            Paragraph(str(i), st["cell"]),
            Paragraph(f"<b>{b.address}</b>", st["cell"]),
            Paragraph(area_cell, st["cell"]),
            Paragraph(_fmt_rate_range([r.rent_eur_per_m2_year for r in rows]), st["cell"]),
            Paragraph(_fmt_rate_range([r.service_charge_eur_per_m2_year for r in rows]), st["cell"]),
            Paragraph(_fmt_rate_range([r.all_in_rate_eur_per_m2_year for r in rows]), st["cell"]),
            Paragraph(availability or "TBD", st["cellsm"]),
            Paragraph(", ".join(b.building_amenities or []) or "—", st["cellsm"]),
        ])
    # A4 portrait leaves 174mm between the margins — these must sum to that.
    table = Table(
        data,
        colWidths=[6 * mm, 32 * mm, 21 * mm, 22 * mm, 22 * mm, 22 * mm, 22 * mm, 27 * mm],
        repeatRows=1,
    )
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        # Tight side padding: with 8 columns on A4 portrait, 5mm each side ate
        # nearly half the narrow columns and split words like "beschikbaar".
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, RULE),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), BAND))
    table.setStyle(TableStyle(style))
    return table


def _facts_table(pairs: list[tuple[str, str]], st: dict) -> Table:
    cells = []
    for i in range(0, len(pairs), 2):
        row = []
        for label, value in pairs[i : i + 2]:
            row.append(Paragraph(label, ParagraphStyle("l", parent=st["cell"], textColor=MUTED)))
            row.append(Paragraph(f"<b>{value}</b>", st["cell"]))
        while len(row) < 4:
            row.append("")
        cells.append(row)
    table = Table(cells, colWidths=[30 * mm, 52 * mm, 30 * mm, 52 * mm])
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return table


def _units_table(entry: LibraryEntry, st: dict) -> Table:
    """Only shown when a building holds more than one available space."""
    head = ["Floor", "Available", "Rent", "Service ch.", "Available from"]
    data = [[Paragraph(h, st["cellhead"]) for h in head]]
    for unit in entry.units:
        row = build_comparison_row(unit)
        data.append([
            Paragraph(unit.floor or "—", st["cell"]),
            Paragraph(_fmt_area(unit.available_area_m2), st["cell"]),
            Paragraph(_fmt_rate(row.rent_eur_per_m2_year), st["cell"]),
            Paragraph(_fmt_rate(row.service_charge_eur_per_m2_year), st["cell"]),
            Paragraph(unit.availability or "TBD", st["cell"]),
        ])
    table = Table(data, colWidths=[26 * mm, 26 * mm, 36 * mm, 36 * mm, 40 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, RULE),
    ]))
    return table


def _building_page(entry: LibraryEntry, number: int, addons: list[AddOn], st: dict) -> list:
    b = entry.building
    rows = _entry_rows(entry)
    flow: list = []

    title = Table(
        [[
            Paragraph(f'<font color="#FFFFFF"><b>{number}</b></font>', st["cell"]),
            Paragraph(f"<b>{b.address}</b>", st["h2"]),
        ]],
        colWidths=[8 * mm, 160 * mm],
    )
    title.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), ACCENT),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (0, 0), "CENTER"),
        ("LEFTPADDING", (1, 0), (1, 0), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    flow.append(title)

    locality = " · ".join([p for p in [b.submarket, b.city] if p])
    if locality:
        flow.append(Paragraph(locality, st["meta"]))
    flow.append(Spacer(1, 5))

    parking = [
        f"€{a.price:,.0f} / {a.price_unit.replace('EUR / ', '').replace('EUR/', '')}"
        for a in addons
        if "parking" in a.name.lower() or "parkeer" in a.name.lower()
    ]
    total_available = sum(u.available_area_m2 for u in entry.units) if entry.units else None
    ratio = next((u.parking_ratio for u in entry.units if u.parking_ratio), None)
    availability = next((u.availability for u in entry.units if u.availability), None)

    smallest = min((u.min_divisible_area_m2 for u in entry.units if u.min_divisible_area_m2), default=None)
    available_text = _fmt_area(total_available)
    if smallest:
        available_text += f" (from {smallest:,.0f} m²)"
    pairs: list[tuple[str, str]] = [
        ("Available", available_text),
        ("Total building", _fmt_area(b.total_building_area_m2)),
        ("Rental price", _fmt_rate_range([r.rent_eur_per_m2_year for r in rows])),
        ("Service charges", _fmt_rate_range([r.service_charge_eur_per_m2_year for r in rows])),
        ("All-in rate", _fmt_rate_range([r.all_in_rate_eur_per_m2_year for r in rows])),
        ("Parking ratio", ratio or "TBD"),
        ("Parking price", parking[0] if parking else "TBD"),
        ("Available from", availability or "TBD"),
        ("Energy rating", b.energy_label or "TBD"),
        ("Year built", str(b.year_built) if b.year_built else "TBD"),
    ]
    pairs.extend([
        (label, value)
        for label, value in [
            ("Public transport", b.public_transport_note),
            ("Highway", b.accessibility_note),
            ("Airport", b.airport_note),
        ]
        if value
    ])

    photo = None
    for url in (b.photos or [])[:3]:
        img = _fetch_image(url)
        if img:
            try:
                iw, ih = img.getSize()
                width = 52 * mm
                photo = Image(img, width=width, height=width * (ih / iw))
            except Exception:
                photo = None
            break

    facts = _facts_table(pairs, st)
    if photo:
        body = Table([[facts, photo]], colWidths=[112 * mm, 56 * mm])
        body.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ]))
        flow.append(body)
    else:
        flow.append(facts)

    if len(entry.units) > 1:
        flow.append(Spacer(1, 8))
        flow.append(Paragraph(f"<b>{len(entry.units)} available spaces</b>", st["body"]))
        flow.append(Spacer(1, 4))
        flow.append(_units_table(entry, st))

    if b.building_amenities:
        flow.append(Spacer(1, 8))
        flow.append(Paragraph(
            f'<font color="#6B6B70">Amenities:</font> {", ".join(b.building_amenities)}', st["body"]
        ))

    if b.description:
        flow.append(Spacer(1, 6))
        text = b.description if len(b.description) <= 700 else b.description[:700] + "…"
        flow.append(Paragraph(text, st["body"]))

    return flow


def render_availability_pdf(
    db: Session,
    *,
    client_name: str,
    entries: list[LibraryEntry],
    prepared_by: str | None = None,
    subtitle: str | None = None,
) -> bytes:
    st = _styles()
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=20 * mm,
        title=f"Availability overview — {client_name}", author=prepared_by or "",
    )

    building_ids = {e.building.building_id for e in entries}
    addons_by_building: dict[str, list[AddOn]] = {bid: [] for bid in building_ids}
    if building_ids:
        for addon in db.query(AddOn).filter(AddOn.building_id.in_(building_ids)).all():
            addons_by_building.setdefault(addon.building_id, []).append(addon)

    flow: list = [
        Paragraph("AVAILABILITY OVERVIEW", st["eyebrow"]),
        Paragraph(client_name, st["h1"]),
    ]
    if subtitle:
        flow.append(Paragraph(subtitle, st["meta"]))
    meta = [date.today().strftime("%d %B %Y"),
            f"{len(entries)} building{'' if len(entries) == 1 else 's'}"]
    if prepared_by:
        meta.append(f"Prepared by {prepared_by}")
    flow.append(Paragraph(" · ".join(meta), st["meta"]))
    flow.append(Spacer(1, 12))

    if not entries:
        flow.append(Paragraph("No buildings selected.", st["body"]))
    else:
        flow.append(_summary_table(entries, st))
        flow.append(Spacer(1, 6))
        flow.append(Paragraph(
            "All-in rate combines rent and service charges. Figures shown as TBD were not stated "
            "by the source listing and are still being confirmed.",
            ParagraphStyle("fn", parent=st["meta"], fontSize=7.5, leading=10),
        ))
        # One detail page per building.
        for i, entry in enumerate(entries, start=1):
            flow.append(PageBreak())
            flow.extend(_building_page(entry, i, addons_by_building.get(entry.building.building_id, []), st))

    doc.build(
        flow,
        onFirstPage=lambda c, d: _header_footer(c, d, client_name),
        onLaterPages=lambda c, d: _header_footer(c, d, client_name),
    )
    return buffer.getvalue()


def build_library_pdf(db: Session, client_name: str, building_ids: list[str], prepared_by: str | None = None) -> bytes:
    """Step 4: selected buildings from the library → client PDF. Buildings
    keep the order the user selected them in."""
    found = {b.building_id: b for b in db.query(Building).filter(Building.building_id.in_(building_ids)).all()}
    entries = [LibraryEntry(building=found[bid], units=list(found[bid].units)) for bid in building_ids if bid in found]
    return render_availability_pdf(db, client_name=client_name, entries=entries, prepared_by=prepared_by)


def build_availability_pdf(db: Session, proposal: Proposal) -> bytes:
    """Same document generated from a saved Proposal — only the units that
    proposal selected, grouped under their buildings."""
    entries: list[LibraryEntry] = []
    by_building: dict[str, LibraryEntry] = {}
    for unit in proposal.selected_units:
        entry = by_building.get(unit.building_id)
        if entry is None:
            entry = LibraryEntry(building=unit.building, units=[])
            by_building[unit.building_id] = entry
            entries.append(entry)
        entry.units.append(unit)
    return render_availability_pdf(
        db,
        client_name=proposal.client.company_name if proposal.client else "Client",
        entries=entries,
        prepared_by=proposal.prepared_by,
        subtitle=proposal.title,
    )
