"""§10 Image Engine.

Full pipeline (download → dedupe → rank into hero/lobby/workspace/etc. →
upscale/perspective/lighting correction) requires network access to source
sites plus an image ML stack (super-resolution, perspective correction)
that isn't available in this environment. What's implemented here is the
part that's pure logic and fully testable: de-duplication by content hash
and category-based ranking/selection, which is the piece the rest of the
pipeline (brochure photo grid, §13) actually depends on. `download_and_enhance`
is the documented plug point for wiring in a real fetch + vision pipeline.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass

CATEGORY_PRIORITY = [
    "hero",
    "exterior",
    "lobby",
    "reception",
    "workspace",
    "meeting_room",
    "breakout_space",
    "neighbourhood",
    "floorplan",
]


@dataclass
class RankedImage:
    url_or_path: str
    category: str
    content_hash: str


def deduplicate(images: list[str]) -> list[str]:
    """Drop images whose bytes are already represented, keyed by a hash of the
    reference string itself as a stand-in for real file-content hashing
    (swap in an actual `hashlib.sha256(file_bytes)` once real downloads run).
    """
    seen: set[str] = set()
    unique: list[str] = []
    for img in images:
        digest = hashlib.sha256(img.encode()).hexdigest()
        if digest not in seen:
            seen.add(digest)
            unique.append(img)
    return unique


def categorize_by_filename(images: list[str]) -> list[RankedImage]:
    """Heuristic categorizer based on filename keywords — deterministic
    placeholder for the real vision-model classifier."""
    ranked: list[RankedImage] = []
    for img in images:
        lowered = img.lower()
        category = next((c for c in CATEGORY_PRIORITY if c.replace("_", "-") in lowered or c in lowered), "workspace")
        ranked.append(RankedImage(url_or_path=img, category=category, content_hash=hashlib.sha256(img.encode()).hexdigest()))
    return ranked


def select_gallery(images: list[str], slots: int = 4) -> list[RankedImage]:
    """Select up to `slots` images, prioritized by CATEGORY_PRIORITY, one per
    category first, then filling remaining slots — matches the brochure's
    4-image grid (exterior + workspace + meeting room + common area, §13).
    """
    unique = deduplicate(images)
    ranked = categorize_by_filename(unique)
    ranked.sort(key=lambda r: CATEGORY_PRIORITY.index(r.category) if r.category in CATEGORY_PRIORITY else len(CATEGORY_PRIORITY))

    selected: list[RankedImage] = []
    used_categories: set[str] = set()
    for r in ranked:
        if len(selected) >= slots:
            break
        if r.category in used_categories:
            continue
        selected.append(r)
        used_categories.add(r.category)

    if len(selected) < slots:
        for r in ranked:
            if len(selected) >= slots:
                break
            if r not in selected:
                selected.append(r)

    return selected[:slots]


def download_and_enhance(url: str) -> str:
    """Plug point for a real pipeline: download -> upscale -> perspective
    correction -> lighting/colour adjustment. Requires outbound access to
    the source site and an image-processing/ML stack; not invoked by the
    demo dataset, which ships with local placeholder filenames.
    """
    raise NotImplementedError(
        "download_and_enhance requires network access to the source listing and an "
        "image-processing backend (e.g. Pillow + a super-resolution model) — wire in "
        "a concrete implementation when those are available in the deployment target."
    )
