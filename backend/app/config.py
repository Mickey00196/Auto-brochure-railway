"""App-wide settings — see spec §21 for the intended production stack."""
from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
EXPORT_DIR = Path(os.environ.get("EXPORT_DIR", BASE_DIR / "exports"))
EXPORT_DIR.mkdir(parents=True, exist_ok=True)

# Pluggable AI provider (§9 description generator, §17 assistant). Left unset by
# default: the app runs fully without it, falling back to deterministic
# templated copy — see app/services/description_generator.py.
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")

# soffice binary used to flatten the PPTX (§14 primary target) into a PDF —
# "PDF as a flattened export of the same slides" rather than a second renderer.
SOFFICE_BIN = os.environ.get("SOFFICE_BIN", "soffice")

OUTLIER_STD_DEV_THRESHOLD = float(os.environ.get("OUTLIER_STD_DEV_THRESHOLD", "1.5"))
