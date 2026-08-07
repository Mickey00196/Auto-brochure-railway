"""Visual de-duplication: the same photo published under unrelated URLs must
collapse, and genuinely different photos must survive."""
from __future__ import annotations

import io
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest
from PIL import Image, ImageDraw

from app.services.photo_dedupe import find_duplicates


def _photo(seed: int, size=(800, 600)) -> Image.Image:
    """A distinctive image — different seeds look genuinely different."""
    img = Image.new("RGB", size, (20 + seed * 37 % 200, 60, 120))
    d = ImageDraw.Draw(img)
    for i in range(9):
        x = (seed * 53 + i * 71) % size[0]
        y = (seed * 29 + i * 47) % size[1]
        d.rectangle([x, y, x + 140 + seed * 3, y + 110 + i * 7], fill=(30 + i * 22, (seed * 61 + i * 30) % 255, 200 - i * 15))
    d.ellipse([60, 60, 260 + seed * 5, 240], fill=(240, 200 - seed * 9 % 200, 40))
    return img


@pytest.fixture(scope="module")
def photo_server(tmp_path_factory):
    root = tmp_path_factory.mktemp("photos")
    a, b, c = _photo(1), _photo(2), _photo(3)

    a.save(root / "a_full.jpg", quality=92)
    # the SAME photo, published as if by a different media id / resizer:
    a.resize((400, 300)).save(root / "totally-different-path.jpg", quality=70)
    a.save(root / "another_id_9911.webp")
    b.save(root / "b_full.jpg", quality=92)
    b.resize((1200, 900)).save(root / "b_large_xyz.png")
    c.save(root / "c_full.jpg", quality=92)

    handler = partial(SimpleHTTPRequestHandler, directory=str(root))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_port}"
    server.shutdown()


def test_same_photo_under_unrelated_urls_collapses(photo_server):
    urls = [
        f"{photo_server}/a_full.jpg",
        f"{photo_server}/totally-different-path.jpg",   # same photo, resized
        f"{photo_server}/another_id_9911.webp",         # same photo, other format
        f"{photo_server}/b_full.jpg",
        f"{photo_server}/b_large_xyz.png",              # same photo, upscaled + png
        f"{photo_server}/c_full.jpg",
    ]
    result = find_duplicates(urls)

    assert result.keep == [f"{photo_server}/a_full.jpg", f"{photo_server}/b_full.jpg", f"{photo_server}/c_full.jpg"]
    assert len(result.duplicates) == 3
    assert len(result.groups) == 2
    assert not result.unreadable


def test_distinct_photos_are_never_merged(photo_server):
    urls = [f"{photo_server}/a_full.jpg", f"{photo_server}/b_full.jpg", f"{photo_server}/c_full.jpg"]
    result = find_duplicates(urls)
    assert result.keep == urls
    assert result.duplicates == []


def test_unreachable_photos_are_kept_not_dropped(photo_server):
    urls = [f"{photo_server}/a_full.jpg", "https://example.invalid/gone.jpg"]
    result = find_duplicates(urls)
    assert "https://example.invalid/gone.jpg" in result.keep
    assert "https://example.invalid/gone.jpg" in result.unreadable
    assert result.duplicates == []


def test_exact_repeat_of_one_url_is_collapsed(photo_server):
    url = f"{photo_server}/a_full.jpg"
    result = find_duplicates([url, url, url])
    assert result.keep == [url]


def test_endpoint_returns_the_deduped_selection(client, photo_server):
    urls = [f"{photo_server}/a_full.jpg", f"{photo_server}/totally-different-path.jpg", f"{photo_server}/b_full.jpg"]
    r = client.post("/photos/duplicates", json={"urls": urls})
    assert r.status_code == 200
    body = r.json()
    assert body["keep"] == [urls[0], urls[2]]
    assert body["duplicates"] == [urls[1]]
