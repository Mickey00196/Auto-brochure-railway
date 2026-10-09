"""A static, numbered-pin overview map for the "Locations overview" page of
the HTML/Playwright library PDF (see renderer.py) — the same numbering as
the per-building pages and the building index, stitched from OpenStreetMap
raster tiles since the deployment has no Google/Mapbox API key configured
(see services/maps.py's module docstring).

Best-effort only, same rule as every other graceful-degradation point in
this PDF pipeline: no network, no OSM response, or no building with
coordinates all mean "no map image", not a broken document.
"""
from __future__ import annotations

import io
import math

import httpx
from PIL import Image, ImageDraw, ImageFont

TILE_SIZE = 256
# identifies this app to OSM's tile servers per their usage policy
# (https://operations.osmfoundation.org/policies/tiles/) — required, not optional.
USER_AGENT = "OfficeShortlist/1.0 (+https://github.com/Mickey00196/auto-brochure-railway)"
PIN_RED = (228, 0, 43)
TILE_TIMEOUT_SECONDS = 4


def _lonlat_to_pixel(lon: float, lat: float, zoom: int) -> tuple[float, float]:
    lat_rad = math.radians(lat)
    n = 2.0**zoom
    x = (lon + 180.0) / 360.0 * n * TILE_SIZE
    y = (1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n * TILE_SIZE
    return x, y


def _fetch_tile(client: httpx.Client, z: int, x: int, y: int) -> Image.Image | None:
    n = 2**z
    x, y = x % n, y % n
    try:
        resp = client.get(f"https://tile.openstreetmap.org/{z}/{x}/{y}.png", timeout=TILE_TIMEOUT_SECONDS)
        if resp.status_code != 200:
            return None
        return Image.open(io.BytesIO(resp.content)).convert("RGBA")
    except Exception:
        return None


def render_overview_map(
    points: list[tuple[int, float, float]], *, width: int = 940, height: int = 560
) -> bytes | None:
    """`points`: (number, lat, lng), same numbering as the rest of the
    document. Returns a PNG, or None if no map could be produced."""
    coords = [(lat, lng) for _, lat, lng in points]
    if not coords:
        return None

    min_lat, max_lat = min(c[0] for c in coords), max(c[0] for c in coords)
    min_lng, max_lng = min(c[1] for c in coords), max(c[1] for c in coords)
    # A single building (or a tight cluster): pick a sensible neighbourhood
    # zoom rather than letting a zero-size bbox divide by zero below.
    if max_lat - min_lat < 0.002:
        min_lat, max_lat = min_lat - 0.01, max_lat + 0.01
    if max_lng - min_lng < 0.002:
        min_lng, max_lng = min_lng - 0.01, max_lng + 0.01

    # Pick the highest zoom at which the padded bbox still fits in the
    # output size, capped to keep tile counts (and OSM load) reasonable.
    zoom = 16
    pad = 0.18
    for z in range(16, 9, -1):
        x0, y0 = _lonlat_to_pixel(min_lng, max_lat, z)
        x1, y1 = _lonlat_to_pixel(max_lng, min_lat, z)
        bbox_w, bbox_h = (x1 - x0), (y1 - y0)
        if bbox_w * (1 + pad) <= width and bbox_h * (1 + pad) <= height:
            zoom = z
            break
    else:
        zoom = 10

    center_lat, center_lng = (min_lat + max_lat) / 2, (min_lng + max_lng) / 2
    cx, cy = _lonlat_to_pixel(center_lng, center_lat, zoom)
    origin_x, origin_y = cx - width / 2, cy - height / 2

    tiles_x = range(int(origin_x // TILE_SIZE), int((origin_x + width) // TILE_SIZE) + 1)
    tiles_y = range(int(origin_y // TILE_SIZE), int((origin_y + height) // TILE_SIZE) + 1)
    if len(list(tiles_x)) * len(list(tiles_y)) > 60:
        return None  # pathological spread — bail rather than hammer the tile server

    canvas = Image.new("RGBA", (width, height), (244, 242, 238, 255))
    try:
        with httpx.Client(headers={"User-Agent": USER_AGENT}) as client:
            got_any = False
            for tx in tiles_x:
                for ty in tiles_y:
                    tile = _fetch_tile(client, zoom, tx, ty)
                    if tile is None:
                        continue
                    got_any = True
                    paste_x = int(tx * TILE_SIZE - origin_x)
                    paste_y = int(ty * TILE_SIZE - origin_y)
                    canvas.paste(tile, (paste_x, paste_y), tile)
            if not got_any:
                return None
    except Exception:
        return None

    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 15
        )
    except Exception:
        font = ImageFont.load_default()

    for number, lat, lng in points:
        px, py = _lonlat_to_pixel(lng, lat, zoom)
        x, y = px - origin_x, py - origin_y
        r = 15
        draw.ellipse((x - r, y - r, x + r, y + r), fill=PIN_RED, outline=(255, 255, 255), width=2)
        label = str(number)
        bbox = draw.textbbox((0, 0), label, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text((x - tw / 2 - bbox[0], y - th / 2 - bbox[1]), label, fill=(255, 255, 255), font=font)

    buf = io.BytesIO()
    canvas.convert("RGB").save(buf, format="PNG")
    return buf.getvalue()
