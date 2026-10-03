"""Turn a listing page's HTML into a NormalizedListing.

Prefers JSON-LD structured data (schema.org RealEstateListing/Place/Product —
common on listing pages and the most reliable), then falls back to OpenGraph/
meta tags and a keyword-anchored read of the visible text via the normalizer.
Whatever isn't found stays None (never guessed). Web-source adapters share
this so they normalize identically; an authorized-API adapter would build a
NormalizedListing directly from JSON and skip this entirely.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from urllib.parse import urljoin

from app.services.scraping import normalizer as N
from app.services.scraping.normalized import NormalizedListing

_SKIP_IMAGE_KEYWORDS = ("logo", "icon", "sprite", "avatar", "pixel", "placeholder")
_AMENITY_PHRASES = [
    "roof terrace", "dakterras", "bicycle storage", "fietsenstalling",
    "24/7 access", "restaurant", "gym", "fitness", "parking", "parkeren",
    "air conditioning", "airconditioning", "meeting room", "vergaderruimte",
    "furnished", "gemeubileerd", "raised floors", "verhoogde vloer",
]


def _iter_jsonld(soup) -> list[dict]:
    out: list[dict] = []
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or tag.get_text() or "")
        except (ValueError, TypeError):
            continue
        graph = data.get("@graph") if isinstance(data, dict) else None
        for obj in (graph if isinstance(graph, list) else data if isinstance(data, list) else [data]):
            if isinstance(obj, dict):
                out.append(obj)
    return out


def parse_listing_html(html: str, url: str, source: str) -> NormalizedListing | None:
    from bs4 import BeautifulSoup

    if not html:
        return None
    soup = BeautifulSoup(html, "html.parser")
    listing = NormalizedListing(source=source, source_url=url, scraped_at=datetime.now(timezone.utc))

    # ---- JSON-LD (most reliable) ----------------------------------------
    address_text = None
    for obj in _iter_jsonld(soup):
        if obj.get("name") and not listing.building_name:
            listing.building_name = str(obj["name"])
        if obj.get("description") and not listing.description:
            listing.description = str(obj["description"])
        addr = obj.get("address")
        if isinstance(addr, dict):
            listing.street = listing.street or addr.get("streetAddress")
            listing.postal_code = listing.postal_code or addr.get("postalCode")
            listing.city = listing.city or addr.get("addressLocality")
        elif isinstance(addr, str):
            address_text = address_text or addr
        geo = obj.get("geo")
        if isinstance(geo, dict):
            listing.latitude = listing.latitude or _to_float(geo.get("latitude"))
            listing.longitude = listing.longitude or _to_float(geo.get("longitude"))
        img = obj.get("image")
        if img and not listing.image_urls:
            listing.image_urls = [urljoin(url, u) for u in (img if isinstance(img, list) else [img]) if u][:8]

    # ---- OpenGraph / meta fallback --------------------------------------
    if not listing.title:
        listing.title = _meta(soup, "og:title") or (soup.title.get_text(strip=True) if soup.title else None)
    if not listing.building_name:
        listing.building_name = listing.title
    if not listing.description:
        listing.description = _meta(soup, "description", attr="name") or _meta(soup, "og:description")
    if not listing.image_urls:
        og_img = _meta(soup, "og:image")
        if og_img:
            listing.image_urls = [urljoin(url, og_img)]

    # ---- Visible-text heuristics (via the shared normalizer) ------------
    text = soup.get_text(separator=" ", strip=True)

    if not (listing.street and listing.city):
        parsed = N.parse_dutch_address(address_text or listing.title or text[:200])
        listing.street = listing.street or parsed["street"]
        listing.house_number = listing.house_number or parsed["house_number"]
        listing.postal_code = listing.postal_code or parsed["postal_code"]
        listing.city = listing.city or parsed["city"]
    else:
        listing.house_number = listing.house_number or N.parse_dutch_address(
            f"{listing.street} {address_text or ''}"
        )["house_number"]

    if listing.street and listing.city:
        listing.address = ", ".join(
            p for p in [
                " ".join(x for x in [listing.street, listing.house_number] if x),
                " ".join(x for x in [listing.postal_code, listing.city] if x),
            ] if p.strip()
        )

    listing.min_area_sqm, listing.max_area_sqm = N.parse_area_range(text)
    listing.available_area_sqm = listing.max_area_sqm or N.parse_area(text)
    listing.energy_label = N.parse_energy_label(text)
    listing.construction_year = N.parse_year(_slice_after(text, ("bouwjaar", "built in", "construction year")))

    amount, unit, period = N.parse_price(_slice_after(text, ("huurprijs", "asking rent", "rent", "€")))
    listing.asking_rent, listing.asking_rent_unit, listing.asking_rent_period = amount, unit, period
    sc_amount, sc_unit, _ = N.parse_price(_slice_after(text, ("servicekosten", "service charge")))
    listing.service_charge, listing.service_charge_unit = sc_amount, sc_unit

    lowered = text.lower()
    listing.amenities = sorted({p.title() for p in _AMENITY_PHRASES if p in lowered})
    listing.parking_available = any(k in lowered for k in ("parking", "parkeren", "parkeerplaats")) or None

    # ---- Extra images from <img> ----------------------------------------
    # Listing pages routinely lazy-load photos, so the real URL lives in
    # data-src / data-lazy-src / data-original / srcset rather than plain src.
    # Checking those recovers photos a naive src-only read would miss (helps
    # the manual paste-HTML flow in particular).
    if len(listing.image_urls) < 4:
        for img in soup.find_all("img"):
            candidates = [
                img.get("src"),
                img.get("data-src"),
                img.get("data-lazy-src"),
                img.get("data-original"),
            ]
            srcset = img.get("srcset") or img.get("data-srcset")
            if srcset:
                # "url1 320w, url2 640w" → take the URL part of each entry.
                candidates.extend(part.strip().split(" ")[0] for part in srcset.split(","))

            for src in candidates:
                if not src or not src.startswith(("http://", "https://", "/")):
                    continue
                if any(k in src.lower() for k in _SKIP_IMAGE_KEYWORDS):
                    continue
                full = urljoin(url, src)
                if full not in listing.image_urls:
                    listing.image_urls.append(full)
                if len(listing.image_urls) >= 8:
                    break
            if len(listing.image_urls) >= 8:
                break

    return listing


def _meta(soup, key: str, attr: str = "property") -> str | None:
    tag = soup.find("meta", attrs={attr: key})
    val = tag.get("content") if tag else None
    return val.strip() if val else None


def _slice_after(text: str, keywords: tuple[str, ...], window: int = 60) -> str:
    lowered = text.lower()
    for kw in keywords:
        idx = lowered.find(kw)
        if idx != -1:
            return text[idx : idx + window]
    return ""


def _to_float(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None
