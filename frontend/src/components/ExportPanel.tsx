"use client";

import { useState } from "react";
import { PROXY_BASE_URL } from "@/lib/api";
import { Button } from "@/components/ui";

type ExportFormat = "availability-pdf" | "pdf" | "pptx" | "one-pager" | "csv" | "excel" | "word";

/** The availability PDF is the product's actual deliverable, so it gets the
 * primary button and no QA gate — everything else is a secondary format. */
const PRIMARY = { format: "availability-pdf" as ExportFormat, label: "Download client PDF", extension: "pdf" };

const OTHER_FORMATS: { format: ExportFormat; label: string; gated: boolean; extension: string }[] = [
  { format: "pptx", label: "PowerPoint deck", gated: true, extension: "pptx" },
  { format: "pdf", label: "Full brochure PDF", gated: true, extension: "pdf" },
  { format: "one-pager", label: "One-pager", gated: true, extension: "pdf" },
  { format: "excel", label: "Excel", gated: false, extension: "xlsx" },
  { format: "csv", label: "CSV", gated: false, extension: "csv" },
  { format: "word", label: "Word", gated: false, extension: "docx" },
];

export function ExportPanel({ proposalId, proposalTitle, exportReady }: { proposalId: string; proposalTitle: string; exportReady: boolean }) {
  const [pending, setPending] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forceExport, setForceExport] = useState(false);
  const [showOthers, setShowOthers] = useState(false);

  async function handleExport(format: ExportFormat, extension: string, gated: boolean) {
    setPending(format);
    setError(null);
    try {
      const force = gated && (forceExport || exportReady);
      const url = `${PROXY_BASE_URL}/proposals/${proposalId}/export/${format}${force ? "?force=true" : ""}`;
      const res = await fetch(url, { method: "POST" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) {
        const body = await res.text();
        // Backend errors arrive as {"detail": "..."} — show the human message,
        // not the raw JSON envelope (or a bare "Internal Server Error").
        let detail = body;
        try {
          detail = JSON.parse(body).detail ?? body;
        } catch {
          /* not JSON — keep raw text */
        }
        if (!detail || /internal server error/i.test(detail)) {
          detail = `That export failed on the server. The client PDF uses a different renderer — try that one.`;
        }
        throw new Error(
          res.status === 409
            ? "This format waits for the data check to pass. Tick 'include unconfirmed figures' below, or use the client PDF, which prints unknown values as TBD."
            : detail,
        );
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${proposalTitle.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}.${extension}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <div>
      <Button
        variant="primary"
        disabled={pending !== null}
        onClick={() => handleExport(PRIMARY.format, PRIMARY.extension, false)}
      >
        {pending === PRIMARY.format ? "Generating…" : PRIMARY.label}
      </Button>
      <p className="mt-2 text-xs text-muted">
        A clean overview of the selected buildings for this client — surface, rent, service charges, all-in rate,
        parking, energy and availability. Anything the listing didn&apos;t state prints as TBD.
      </p>

      <button
        type="button"
        onClick={() => setShowOthers((v) => !v)}
        className="mt-4 text-xs font-medium text-muted underline underline-offset-2 hover:text-foreground"
      >
        {showOthers ? "Hide other formats" : "Other formats (PowerPoint, Excel, Word…)"}
      </button>

      {showOthers && (
        <div className="mt-3 border-t border-border pt-3">
          {!exportReady && (
            <label className="mb-3 flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={forceExport} onChange={(e) => setForceExport(e.target.checked)} />
              Include unconfirmed figures in the gated formats (your sign-off)
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            {OTHER_FORMATS.map(({ format, label, gated, extension }) => (
              <Button key={format} variant="ghost" disabled={pending !== null} onClick={() => handleExport(format, extension, gated)}>
                {pending === format ? "Generating…" : label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
    </div>
  );
}
