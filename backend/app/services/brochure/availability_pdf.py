"""Client-facing availability overview, rendered straight to PDF.

This is the tool's core deliverable: pick the buildings you captured, pick
the client, get a PDF of what's available. It is deliberately *not* the
PPTX→LibreOffice path (pdf_export.py): that conversion needs a working
`soffice` binary on the host, and when the host doesn't have one the user's
main output simply fails. ReportLab is a pure-Python dependency, so this
route works on any deployment that can run the app at all.

Unknown values render as "TBD" rather than blocking the document — an
overview of what's available is still useful (and often exactly what a
broker sends) while a few fields are still being chased down. The QA pass
stays available for anyone who wants the stricter, sign-off-gated deck.
"""
from __future__ import annotations

import io
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

from app.models import AddOn, Proposal, Unit
from app.services.comparison import build_comparison_table

ACCENT = colors.HexColor("#C8102E")
INK = colors.HexColor("#17171A")
MUTED = colors.HexColor("#6B6B70")
RULE = colors.HexColor("#D8D8DC")
BAND = colors.HexColor("#F4F4F6")

PHOTO_TIMEOUT_SECONDS = 6


def _fmt_money_rate(value: float | None, suffix: str = "m²/yr") -> str:
    return f"€{value:,.0f} / {suffix}" if value is not None else "TBD"


def _fmt_area(value: float | None) -> str:
    return f"{value:,.0f} m²" if value is not None else "TBD"


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
        "eyebrow": ParagraphStyle(
            "eyebrow", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=8.5,
            textColor=ACCENT, spaceAfter=2, leading=11,
        ),
        "h1": ParagraphStyle(
            "h1", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=26,
            textColor=INK, leading=30, spaceAfter=4,
        ),
        "h2": ParagraphStyle(
            "h2", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=13,
            textColor=INK, leading=16, spaceBefore=2, spaceAfter=4,
        ),
        "meta": ParagraphStyle(
            "meta", parent=base["Normal"], fontName="Helvetica", fontSize=9.5,
            textColor=MUTED, leading=13,
        ),
        "body": ParagraphStyle(
            "body", parent=base["Normal"], fontName="Helvetica", fontSize=9,
            textColor=INK, leading=12.5, alignment=TA_LEFT,
        ),
        "cell": ParagraphStyle(
            "cell", parent=base["Normal"], fontName="Helvetica", fontSize=8.5,
            textColor=INK, leading=11,
        ),
        "cellhead": ParagraphStyle(
            "cellhead", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=8.5,
            textColor=colors.white, leading=11,
        ),
    }


def _header_footer(canvas, doc, client_name: str):
    canvas.saveState()
    # Accent rule under a compact running header
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


def _summary_table(rows, unit_number: dict[str, int], st: dict) -> Table:
    """Rows arrive in the broker's own selection order so the numbers here
    match the detail sections (1, 2, 3…) — build_comparison_table sorts by
    all-in rate, which reads as scrambled numbering in a client document."""
    head = ["#", "Address", "Available", "Rent", "Service ch.", "All-in", "Available from"]
    data = [[Paragraph(h, st["cellhead"]) for h in head]]
    for r in rows:
        data.append([
            Paragraph(str(unit_number.get(r.unit_id, "")), st["cell"]),
            Paragraph(f"<b>{r.address}</b>", st["cell"]),
            Paragraph(_fmt_area(r.available_area_m2), st["cell"]),
            Paragraph(_fmt_money_rate(r.rent_eur_per_m2_year), st["cell"]),
            Paragraph(_fmt_money_rate(r.service_charge_eur_per_m2_year), st["cell"]),
            Paragraph(_fmt_money_rate(r.all_in_rate_eur_per_m2_year), st["cell"]),
            Paragraph(r.availability or "TBD", st["cell"]),
        ])
    table = Table(data, colWidths=[8 * mm, 52 * mm, 22 * mm, 27 * mm, 27 * mm, 27 * mm, 21 * mm], repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, RULE),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), BAND))
    table.setStyle(TableStyle(style))
    return table


def _facts_table(pairs: list[tuple[str, str]], st: dict) -> Table:
    """Two-column label/value grid used for each building's key facts."""
    cells = []
    for i in range(0, len(pairs), 2):
        chunk = pairs[i : i + 2]
        row = []
        for label, value in chunk:
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


def _unit_section(unit: Unit, row, number: int, addons: list[AddOn], st: dict) -> list:
    building = unit.building
    flow: list = []

    title = Table(
        [[
            Paragraph(f'<font color="#FFFFFF"><b>{number}</b></font>', st["cell"]),
            Paragraph(f"<b>{building.address}</b>", st["h2"]),
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

    locality = " · ".join([p for p in [building.submarket, building.city] if p])
    if locality:
        flow.append(Paragraph(locality, st["meta"]))
    flow.append(Spacer(1, 4))

    parking_prices = [
        f"€{a.price:,.0f} / {a.price_unit.replace('EUR / ', '').replace('EUR/', '')}"
        for a in addons
        if "parking" in a.name.lower() or "parkeer" in a.name.lower()
    ]
    pairs: list[tuple[str, str]] = [
        ("Available", _fmt_area(unit.available_area_m2)),
        ("Total building", _fmt_area(building.total_building_area_m2)),
        ("Rental price", _fmt_money_rate(row.rent_eur_per_m2_year)),
        ("Service charges", _fmt_money_rate(row.service_charge_eur_per_m2_year)),
        ("All-in rate", _fmt_money_rate(row.all_in_rate_eur_per_m2_year)),
        ("Parking ratio", unit.parking_ratio or "TBD"),
        ("Parking price", parking_prices[0] if parking_prices else "TBD"),
        ("Available from", unit.availability or "TBD"),
        ("Energy rating", building.energy_label or "TBD"),
        ("Year built", str(building.year_built) if building.year_built else "TBD"),
    ]
    distances = [
        ("Public transport", building.public_transport_note),
        ("Highway", building.accessibility_note),
        ("Airport", building.airport_note),
    ]
    pairs.extend([(label, value) for label, value in distances if value])

    photo = None
    for url in (building.photos or [])[:3]:
        img = _fetch_image(url)
        if img:
            try:
                iw, ih = img.getSize()
                target_w = 52 * mm
                photo = Image(img, width=target_w, height=target_w * (ih / iw))
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

    if building.building_amenities:
        flow.append(Spacer(1, 3))
        flow.append(Paragraph(
            f'<font color="#6B6B70">Amenities:</font> {", ".join(building.building_amenities)}',
            st["body"],
        ))
    flow.append(Spacer(1, 10))
    return flow


def build_availability_pdf(db: Session, proposal: Proposal) -> bytes:
    """Render the proposal's selected units as a client-facing availability
    overview. Returns PDF bytes; never gated on QA."""
    units: list[Unit] = list(proposal.selected_units)
    rows = build_comparison_table(units)
    row_by_unit = {r.unit_id: r for r in rows}
    unit_number = {unit.unit_id: i + 1 for i, unit in enumerate(units)}

    building_ids = {u.building_id for u in units}
    addons_by_building: dict[str, list[AddOn]] = {bid: [] for bid in building_ids}
    if building_ids:
        for addon in db.query(AddOn).filter(AddOn.building_id.in_(building_ids)).all():
            addons_by_building.setdefault(addon.building_id, []).append(addon)

    st = _styles()
    buffer = io.BytesIO()
    client_name = proposal.client.company_name if proposal.client else "Client"
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=20 * mm,
        title=f"Availability overview — {client_name}",
        author=proposal.prepared_by or "",
    )

    flow: list = [
        Paragraph("AVAILABILITY OVERVIEW", st["eyebrow"]),
        Paragraph(client_name, st["h1"]),
        Paragraph(proposal.title, st["meta"]),
    ]
    meta_bits = [date.today().strftime("%d %B %Y"), f"{len(units)} option{'' if len(units) == 1 else 's'}"]
    if proposal.prepared_by:
        meta_bits.append(f"Prepared by {proposal.prepared_by}")
    flow.append(Paragraph(" · ".join(meta_bits), st["meta"]))
    flow.append(Spacer(1, 12))

    if not units:
        flow.append(Paragraph(
            "No buildings selected for this client yet. Add buildings to the selection to see them here.",
            st["body"],
        ))
    else:
        ordered_rows = [row_by_unit[u.unit_id] for u in units if u.unit_id in row_by_unit]
        flow.append(_summary_table(ordered_rows, unit_number, st))
        flow.append(Spacer(1, 6))
        flow.append(Paragraph(
            "All-in rate combines rent and service charges. Figures shown as TBD were not stated "
            "by the source listing and are still being confirmed.",
            ParagraphStyle("fn", parent=st["meta"], fontSize=7.5, leading=10),
        ))
        flow.append(PageBreak())

        for unit in units:
            row = row_by_unit.get(unit.unit_id)
            if row is None:
                continue
            section = _unit_section(
                unit, row, unit_number[unit.unit_id], addons_by_building.get(unit.building_id, []), st
            )
            flow.append(KeepTogether(section))

    doc.build(
        flow,
        onFirstPage=lambda c, d: _header_footer(c, d, client_name),
        onLaterPages=lambda c, d: _header_footer(c, d, client_name),
    )
    return buffer.getvalue()
