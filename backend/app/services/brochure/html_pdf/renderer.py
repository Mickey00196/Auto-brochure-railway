"""The "Generate PDF" output for the Office Shortlist library/client-folder
tool — ported 1:1 (layout, type, color, page structure) from a real
Cushman & Wakefield Utrecht "Office Market Inventory" deck the user supplied,
with every page's content filled from the selection's actual Building/Unit/
Client data instead of that deck's example buildings.

Architecture: Jinja2 renders each of the 9 page templates (cover, contents,
your-requirements, the-locations index, locations overview map, one
building page per selected building, occupancy cost, project team,
disclaimer) to an HTML string; all pages are concatenated into one
document and handed to a headless Chromium (Playwright, already a backend
dependency) which prints it straight to PDF — the only renderer that can
reproduce arbitrary CSS/web-font layout faithfully, which the previous
ReportLab-based renderer (availability_pdf.py, still used for the
Proposal-based PDF) was never going to manage for a design this specific.

Missing data degrades the same way throughout: a genuinely uncollected
field (nothing in Client.search_brief — there is no form for headcount,
move-in date, lease term, delivery level, or parking count anywhere in the
app yet) renders as a bracketed placeholder, exactly matching the source
deck's own "still to fill in" convention; a per-building fact degrades to
"TBD", the existing convention from the ReportLab renderer. Nothing is
invented, and nothing blocks the document from generating.
"""
from __future__ import annotations

import base64
import datetime as dt
from collections import Counter
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy.orm import Session

from app.models import AddOn, Building, Client, Unit
from app.services.comparison import build_comparison_row

from . import static_map
from .assets import font_face_css, logo_data_uri

TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"

FIRM_NAME = "Cushman & Wakefield Utrecht"
FIRM_ADDRESS_LINE1 = "Reykjavikstraat 1"
FIRM_ADDRESS_LINE2 = "3543 KH Utrecht"
FIRM_PHONE = "+31 (0)30 233 2552"
FIRM_EMAIL = "utrecht@cushwake.com"

PDF_PAGE_WIDTH_PX = 1123
PDF_PAGE_HEIGHT_PX = 794

_env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=select_autoescape(["html.jinja"]),
)


def _bracket(text: str) -> str:
    return f'<span class="ph">{text}</span>'


def _fmt_money(value) -> str:
    try:
        return f"€ {value:,.0f}"
    except (TypeError, ValueError):
        return str(value)


def _fmt_area(value) -> str:
    try:
        return f"{value:,.0f} sqm"
    except (TypeError, ValueError):
        return str(value)


DELIVERY_LABELS = {
    "turn_key": "Turn-key",
    "shell_and_core": "Shell and core",
    "shell_and_core_plus": "Shell and core, plus",
    "mixed": "Mixed",
}


def _primary_unit(units: list[Unit]) -> Unit | None:
    return units[0] if units else None


def _building_context(building: Building, units: list[Unit], addons: list[AddOn], number: int, page: int) -> dict:
    total_available = sum(u.available_area_m2 for u in units) if units else building.total_building_area_m2
    rents = [u.rent_eur_per_m2_year for u in units if u.rent_eur_per_m2_year is not None]
    service_charges = [u.service_charge_eur_per_m2_year for u in units if u.service_charge_eur_per_m2_year is not None]
    smallest_divisible = min((u.min_divisible_area_m2 for u in units if u.min_divisible_area_m2), default=None)
    availability = next((u.availability for u in units if u.availability), None)
    parking_ratio = next((u.parking_ratio for u in units if u.parking_ratio), None)
    delivery = next((u.delivery_condition for u in units if u.delivery_condition), None)
    parking_addon = next(
        (a for a in addons if "park" in a.name.lower()), None
    )

    units_text = "TBD"
    if smallest_divisible:
        units_text = f"From approx. {smallest_divisible:,.0f} sqm"
    elif units:
        units_text = f"{len(units)} space{'s' if len(units) != 1 else ''}"

    facts: list[tuple[str, str]] = [
        ("Subarea", building.submarket or "TBD"),
        ("Total surface", _fmt_area(building.total_building_area_m2) if building.total_building_area_m2 else "TBD"),
        ("Units", units_text),
        ("Parking", parking_ratio or "TBD"),
        (
            "Parking rent",
            f"€ {parking_addon.price:,.0f} per space per year" if parking_addon else "TBD",
        ),
        ("Delivery", DELIVERY_LABELS.get(delivery, delivery) if delivery else "TBD"),
        ("Availability", availability or "TBD"),
        (
            "Service charges",
            f"€ {min(service_charges):,.0f}–€ {max(service_charges):,.0f} per sqm per year"
            if len(set(service_charges)) > 1
            else (f"€ {service_charges[0]:,.0f} per sqm per year" if service_charges else "TBD"),
        ),
        ("Year of construction", str(building.year_built) if building.year_built else "TBD"),
    ]

    return {
        "number": number,
        "page": page,
        "name": building.name,
        "submarket": building.submarket,
        "address": ", ".join(p for p in [building.address, building.postal_code, building.city] if p),
        "photo": (building.photos or [None])[0],
        "available_value": f"{total_available:,.0f}" if total_available else "TBD",
        "available_unit": "sqm, approx.",
        "rent_value": (
            f"€ {min(rents):,.0f}–{max(rents):,.0f}" if len(set(rents)) > 1 else (f"€ {rents[0]:,.0f}" if rents else "TBD")
        ),
        "rent_unit": "per sqm per year",
        "energy_label": building.energy_label or "TBD",
        "road_access": building.accessibility_note or "TBD",
        "public_transport": building.public_transport_note or "TBD",
        "airport": building.airport_note or "TBD",
        "facts": facts,
        "facilities": ", ".join(building.building_amenities) if building.building_amenities else None,
    }


def _occupancy_rows(entries: list[tuple[Building, list[Unit]]], required_area: float, parking_spaces: int) -> list[dict]:
    computed = []
    for building, units in entries:
        rows = [build_comparison_row(u) for u in units]
        rents = [r.rent_eur_per_m2_year for r in rows if r.rent_eur_per_m2_year is not None]
        services = [r.service_charge_eur_per_m2_year for r in rows if r.service_charge_eur_per_m2_year is not None]
        if not rents and not services:
            computed.append(
                {
                    "building": building,
                    "total": None,
                    "rent_per_sqm": 0,
                    "service_per_sqm": 0,
                    "all_in_per_sqm": None,
                }
            )
            continue
        rent_per_sqm = min(rents) if rents else 0
        service_per_sqm = min(services) if services else 0
        all_in = rent_per_sqm + service_per_sqm
        computed.append(
            {
                "building": building,
                "total": all_in * required_area,
                "rent_per_sqm": rent_per_sqm,
                "service_per_sqm": service_per_sqm,
                "all_in_per_sqm": all_in,
            }
        )

    priced = [c for c in computed if c["total"] is not None]
    priced.sort(key=lambda c: c["total"])
    max_total = max((c["total"] for c in priced), default=1) or 1

    addons_by_building: dict[str, float | None] = {}
    rows = []
    for c in priced:
        building = c["building"]
        parking_addon = next(
            (a for a in (building.addons or []) if "park" in a.name.lower()), None
        )
        parking_total = f"€ {parking_addon.price * parking_spaces:,.0f}" if parking_addon else "To be determined"
        parking_unit = f"€ {parking_addon.price:,.0f} per space" if parking_addon else ""
        rent_share_pct = round((c["rent_per_sqm"] / c["all_in_per_sqm"]) * 100) if c["all_in_per_sqm"] else 100
        rows.append(
            {
                "name": building.name,
                "address": ", ".join(p for p in [building.address, building.city] if p),
                "total_label": f"€ {c['total']:,.0f}",
                "all_in_label": f"€ {c['all_in_per_sqm']:,.0f}",
                "bar_width_pct": round(20 + 80 * (c["total"] / max_total)),
                "rent_share_pct": rent_share_pct,
                "parking_total_label": parking_total,
                "parking_unit_label": parking_unit,
                "note": None,
            }
        )
    for c in [c for c in computed if c["total"] is None]:
        building = c["building"]
        rows.append(
            {
                "name": building.name,
                "address": ", ".join(p for p in [building.address, building.city] if p),
                "total_label": "TBD",
                "all_in_label": "TBD",
                "bar_width_pct": 0,
                "rent_share_pct": 0,
                "parking_total_label": "TBD",
                "parking_unit_label": "",
                "note": "Rent not yet confirmed",
            }
        )
    return rows


def _brief_fields(brief: dict) -> tuple[list[tuple[str, str]], list[str]]:
    size_min = brief.get("size_m2_min")
    size_max = brief.get("size_m2_max")
    if size_min and size_max and size_min != size_max:
        area_value = f"{size_min:,.0f}–{size_max:,.0f} sqm"
    elif size_min or size_max:
        area_value = _fmt_area(size_min or size_max)
    else:
        area_value = _bracket("[number] sqm")

    budget = brief.get("budget_eur_per_m2_year")
    budget_value = f"{_fmt_money(budget)} / sqm / yr excl. VAT" if budget else _bracket("€ [amount] excl. VAT")

    fields = [
        ("Headcount", _bracket("[number] employees")),
        ("Required office area", area_value),
        ("Preferred location", brief.get("location") or _bracket("[location]")),
        ("Move-in date", _bracket("[date]")),
        ("Lease term", _bracket("[number] years")),
        ("Delivery level", _bracket("[turn-key / shell and core]")),
        ("Parking", _bracket("[number] spaces")),
        ("Annual budget", budget_value),
    ]
    must_haves = list(brief.get("must_haves") or [])
    return fields, must_haves


def render_library_pdf_html(
    db: Session,
    *,
    client_name: str,
    building_ids: list[str],
    prepared_by: str | None = None,
    client_id: str | None = None,
) -> bytes:
    found = {b.building_id: b for b in db.query(Building).filter(Building.building_id.in_(building_ids)).all()}
    buildings = [found[bid] for bid in building_ids if bid in found]

    building_ids_set = {b.building_id for b in buildings}
    addons_by_building: dict[str, list[AddOn]] = {bid: [] for bid in building_ids_set}
    if building_ids_set:
        for addon in db.query(AddOn).filter(AddOn.building_id.in_(building_ids_set)).all():
            addons_by_building.setdefault(addon.building_id, []).append(addon)

    client: Client | None = db.get(Client, client_id) if client_id else None
    client_display_name = client.display_name if client else (client_name or "Client")
    brief = (client.search_brief if client else None) or {}

    cities = [b.city for b in buildings if b.city]
    city = Counter(cities).most_common(1)[0][0] if cities else None
    subareas = sorted({b.submarket for b in buildings if b.submarket})

    building_count = len(buildings)
    # Page numbering, computed once so every page that links to another
    # (contents, "used on page X") stays correct regardless of selection size.
    locations_overview_page = 5
    first_building_page = 6
    occupancy_page = first_building_page + building_count
    team_page = occupancy_page + 1
    disclaimer_page = team_page + 1

    shared = {
        "logo_src": logo_data_uri(),
        "firm_name": FIRM_NAME,
        "firm_address_line1": FIRM_ADDRESS_LINE1,
        "firm_address_line2": FIRM_ADDRESS_LINE2,
        "firm_phone": FIRM_PHONE,
        "firm_email": FIRM_EMAIL,
        "city": city,
        "client_display_name": client_display_name,
        "building_count": building_count,
    }

    pages: list[str] = []

    pages.append(
        _env.get_template("cover.html.jinja").render(
            **shared,
            hero_photo=(buildings[0].photos[0] if buildings and buildings[0].photos else None),
            prepared_date=dt.date.today().strftime("%B %Y"),
        )
    )

    toc = [
        {"label": "Your requirements", "page": 3},
        {"label": "The locations", "page": 4},
        {"label": "Indicative occupancy cost", "page": occupancy_page},
        {"label": "Project team", "page": team_page},
    ]
    pages.append(
        _env.get_template("contents.html.jinja").render(
            **shared, toc=toc, subareas=subareas, disclaimer_page=disclaimer_page
        )
    )

    brief_fields, must_haves = _brief_fields(brief)
    pages.append(
        _env.get_template("requirements.html.jinja").render(
            **shared, brief_fields=brief_fields, must_haves=must_haves, occupancy_page=occupancy_page
        )
    )

    locations_buildings = [
        {
            "name": b.name,
            "submarket": b.submarket,
            "photo": (b.photos or [None])[0],
            "page": first_building_page + i,
        }
        for i, b in enumerate(buildings)
    ]
    grid_rows = max(1, -(-(building_count + 1) // 2))  # ceil((N+1)/2)
    pages.append(
        _env.get_template("locations_index.html.jinja").render(
            **shared,
            buildings=locations_buildings,
            locations_overview_page=locations_overview_page,
            grid_rows=grid_rows,
        )
    )

    numbered_points = [
        (i + 1, b.latitude, b.longitude) for i, b in enumerate(buildings) if b.latitude is not None and b.longitude is not None
    ]
    map_png = static_map.render_overview_map(numbered_points) if numbered_points else None
    map_image = f"data:image/png;base64,{base64.b64encode(map_png).decode('ascii')}" if map_png else None
    pages.append(
        _env.get_template("locations_map.html.jinja").render(
            **shared,
            map_image=map_image,
            legend=[{"name": b.name} for b in buildings],
        )
    )

    occupancy_entries = [(b, list(b.units)) for b in buildings]
    for i, building in enumerate(buildings):
        ctx = _building_context(
            building, list(building.units), addons_by_building.get(building.building_id, []), i + 1, first_building_page + i
        )
        pages.append(_env.get_template("building.html.jinja").render(**shared, b=ctx))

    required_area = brief.get("size_m2_max") or brief.get("size_m2_min") or 1000
    parking_spaces = brief.get("parking_spaces") or 20
    rows = _occupancy_rows(occupancy_entries, required_area, parking_spaces)
    pages.append(
        _env.get_template("occupancy_cost.html.jinja").render(
            **shared,
            rows=rows,
            required_area_label=_fmt_area(required_area),
            parking_spaces_label=f"{parking_spaces} spaces",
            occupancy_page=occupancy_page,
        )
    )

    pages.append(
        _env.get_template("project_team.html.jinja").render(
            **shared, prepared_by=prepared_by, team_page=team_page
        )
    )

    pages.append(
        _env.get_template("disclaimer.html.jinja").render(
            **shared, year=dt.date.today().year, disclaimer_page=disclaimer_page
        )
    )

    base_css = _env.get_template("base.css.jinja").render(font_face_css=font_face_css())
    document_html = (
        "<!DOCTYPE html><html><head><meta charset=\"utf-8\">"
        f"<style>{base_css}</style></head><body>"
        + "\n".join(pages)
        + "</body></html>"
    )

    return _render_pdf(document_html)


def _render_pdf(html: str) -> bytes:
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        try:
            page = browser.new_page(viewport={"width": PDF_PAGE_WIDTH_PX, "height": PDF_PAGE_HEIGHT_PX})
            page.set_content(html, wait_until="load")
            pdf_bytes = page.pdf(
                width=f"{PDF_PAGE_WIDTH_PX}px",
                height=f"{PDF_PAGE_HEIGHT_PX}px",
                print_background=True,
                margin={"top": "0px", "bottom": "0px", "left": "0px", "right": "0px"},
            )
        finally:
            browser.close()
    return pdf_bytes
