"""Brand assets for the HTML/Playwright library PDF, inlined as data: URIs
so the rendered document is one self-contained HTML string — no relative
paths for Playwright to resolve, no static file server needed."""
from __future__ import annotations

import base64
from functools import lru_cache
from pathlib import Path

ASSETS_DIR = Path(__file__).resolve().parent.parent.parent.parent / "assets"

_FONT_WEIGHTS = (300, 400, 500, 600)


@lru_cache(maxsize=1)
def font_face_css() -> str:
    blocks = []
    for weight in _FONT_WEIGHTS:
        path = ASSETS_DIR / "fonts" / f"HankenGrotesk-{weight}.woff2"
        data = base64.b64encode(path.read_bytes()).decode("ascii")
        blocks.append(
            f"""@font-face {{
  font-family: 'Hanken Grotesk';
  font-style: normal;
  font-weight: {weight};
  font-display: swap;
  src: url(data:font/woff2;base64,{data}) format('woff2');
}}"""
        )
    return "\n".join(blocks)


@lru_cache(maxsize=1)
def logo_data_uri() -> str:
    data = base64.b64encode((ASSETS_DIR / "cushman_wakefield_logo.png").read_bytes()).decode("ascii")
    return f"data:image/png;base64,{data}"


def photo_data_uri(image_bytes: bytes, mime: str = "image/jpeg") -> str:
    return f"data:{mime};base64,{base64.b64encode(image_bytes).decode('ascii')}"
