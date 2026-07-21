"use client";

import { useState } from "react";
import { PROXY_BASE_URL } from "@/lib/api";
import { Button } from "@/components/ui";

type ExportFormat = "pdf" | "pptx" | "one-pager" | "csv" | "excel" | "word";

const FORMATS: { format: ExportFormat; label: string; gated: boolean; extension: string }[] = [
  { format: "pptx", label: "PowerPoint (primary)", gated: true, extension: "pptx" },
  { format: "pdf", label: "PDF", gated: true, extension: "pdf" },
  { format: "one-pager", label: "One-Pager PDF", gated: true, extension: "pdf" },
  { format: "csv", label: "CSV", gated: false, extension: "csv" },
  { format: "excel", label: "Excel", gated: false, extension: "xlsx" },
  { format: "word", label: "Word", gated: false, extension: "docx" },
];

export function ExportPanel({ proposalId, proposalTitle, exportReady }: { proposalId: string; proposalTitle: string; exportReady: boolean }) {
  const [pending, setPending] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forceExport, setForceExport] = useState(false);

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
        throw new Error(res.status === 409 ? "Blocked by QA — resolve or acknowledge TBD fields first, or check 'force export'." : body);
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
      {!exportReady && (
        <label className="mb-3 flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={forceExport} onChange={(e) => setForceExport(e.target.checked)} />
          Force export gated formats despite unresolved QA issues (explicit sign-off, §8/§24)
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {FORMATS.map(({ format, label, gated, extension }) => (
          <Button
            key={format}
            variant={format === "pptx" ? "primary" : "ghost"}
            disabled={pending !== null}
            onClick={() => handleExport(format, extension, gated)}
          >
            {pending === format ? "Generating…" : label}
          </Button>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
