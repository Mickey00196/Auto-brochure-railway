"""PDF export as a flattened rendering of the PPTX deck (§14) — not a
second renderer. Uses headless LibreOffice (requires the libreoffice-impress
package for the Impress import/export filters — libreoffice-core alone does
not register them), which is deterministic and requires no external service
or API key.
"""
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

from app.config import SOFFICE_BIN


def pptx_to_pdf(pptx_path: Path, out_dir: Path) -> Path:
    """Each call gets its own -env:UserInstallation profile dir — soffice
    allows only one live instance per profile, so sharing one across
    concurrent conversions would serialize (or deadlock) requests.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="soffice-profile-") as profile_dir:
        result = subprocess.run(
            [
                SOFFICE_BIN,
                "--headless",
                "--norestore",
                f"-env:UserInstallation=file://{profile_dir}",
                "--convert-to",
                "pdf",
                "--outdir",
                str(out_dir),
                str(pptx_path),
            ],
            capture_output=True,
            text=True,
            timeout=120,
        )
    pdf_path = out_dir / (pptx_path.stem + ".pdf")
    if result.returncode != 0 or not pdf_path.exists():
        raise RuntimeError(f"soffice PDF conversion failed (code {result.returncode}): {result.stderr}")
    return pdf_path
