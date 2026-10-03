"""Find duplicate photos by looking at the images, not their URLs.

URL-shaped de-duplication only catches the same photo served under a
predictable variant of one address ("…_720x480.jpg" vs "…_1440x960.jpg").
Listing sites also publish the very same shot under genuinely unrelated
paths — a different media id, a resizer with its own token — and no amount
of string normalisation can tell those apart. Comparing the decoded pixels
can.

Uses a difference hash: greyscale, squash to 9x8, and record whether each
pixel is brighter than the one to its right. That yields 64 bits per image
which survive rescaling and re-compression (the ways a CDN varies a photo)
while still differing between two genuinely different rooms.
"""
from __future__ import annotations

import io
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

from PIL import Image

FETCH_TIMEOUT_SECONDS = 6
MAX_BYTES_PER_IMAGE = 8_000_000
MAX_URLS = 80
MAX_WORKERS = 8

# Out of 64 bits. Rescaled/re-encoded copies of one photo land within a
# couple of bits; different photographs of the same room sit far higher.
# Deliberately conservative — wrongly dropping a real photo is worse than
# leaving a duplicate for the user to remove by hand.
HAMMING_THRESHOLD = 5


@dataclass
class DedupeResult:
    keep: list[str]
    duplicates: list[str]
    unreadable: list[str]
    groups: list[list[str]]


def _fetch(url: str) -> bytes | None:
    if not url.startswith(("http://", "https://")):
        return None
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT_SECONDS) as resp:
            return resp.read(MAX_BYTES_PER_IMAGE)
    except Exception:
        return None


def _dhash(data: bytes) -> int | None:
    try:
        with Image.open(io.BytesIO(data)) as img:
            small = img.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
            pixels = list(small.getdata())
    except Exception:
        return None
    bits = 0
    for row in range(8):
        base = row * 9
        for col in range(8):
            bits = (bits << 1) | (1 if pixels[base + col] > pixels[base + col + 1] else 0)
    return bits


def _hash_url(url: str) -> tuple[str, int | None]:
    data = _fetch(url)
    return url, (_dhash(data) if data else None)


def find_duplicates(urls: list[str], threshold: int = HAMMING_THRESHOLD) -> DedupeResult:
    """Group visually identical photos, keeping the first of each group —
    the capture order is the broker's order, so the earliest occurrence is
    the one that stays."""
    ordered: list[str] = []
    seen: set[str] = set()
    for url in urls[:MAX_URLS]:
        u = url.strip()
        if u and u not in seen:
            seen.add(u)
            ordered.append(u)

    if len(ordered) < 2:
        return DedupeResult(keep=ordered, duplicates=[], unreadable=[], groups=[])

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        hashes = dict(pool.map(_hash_url, ordered))

    keep: list[str] = []
    duplicates: list[str] = []
    unreadable: list[str] = []
    representatives: list[tuple[int, int]] = []  # (hash, index into groups)
    groups: list[list[str]] = []

    for url in ordered:
        h = hashes.get(url)
        if h is None:
            # Could not be read here (dead link, hotlink protection, an odd
            # format). Never dropped on that basis — only reported.
            unreadable.append(url)
            keep.append(url)
            continue
        match = next((gi for rep, gi in representatives if bin(rep ^ h).count("1") <= threshold), None)
        if match is None:
            representatives.append((h, len(groups)))
            groups.append([url])
            keep.append(url)
        else:
            groups[match].append(url)
            duplicates.append(url)

    return DedupeResult(
        keep=keep,
        duplicates=duplicates,
        unreadable=unreadable,
        groups=[g for g in groups if len(g) > 1],
    )
