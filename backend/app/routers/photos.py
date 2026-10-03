"""Photo housekeeping for a captured gallery — currently duplicate detection.

Runs server-side because the browser cannot read the pixels of a
cross-origin CDN image (the canvas is tainted and getImageData throws), so
visual comparison is impossible in the extension or the page.
"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.photo_dedupe import find_duplicates

router = APIRouter(prefix="/photos", tags=["photos"])


class DuplicateRequest(BaseModel):
    urls: list[str] = Field(default_factory=list)


class DuplicateResponse(BaseModel):
    keep: list[str]
    duplicates: list[str]
    unreadable: list[str]
    groups: list[list[str]]


@router.post("/duplicates", response_model=DuplicateResponse)
def detect_duplicates(payload: DuplicateRequest) -> DuplicateResponse:
    result = find_duplicates(payload.urls)
    return DuplicateResponse(
        keep=result.keep,
        duplicates=result.duplicates,
        unreadable=result.unreadable,
        groups=result.groups,
    )
