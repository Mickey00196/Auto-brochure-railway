"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { QAReport } from "@/lib/types";
import { Badge, Card } from "@/components/ui";

const SEVERITY_TONE = { blocking: "danger", warning: "warn", info: "default" } as const;

export function QAPanel({
  proposalId,
  initialReport,
  onReadyChange,
}: {
  proposalId: string;
  initialReport: QAReport;
  onReadyChange?: (ready: boolean) => void;
}) {
  const [report, setReport] = useState(initialReport);
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    onReadyChange?.(report.is_export_ready);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.is_export_ready]);

  async function toggleAcknowledge(unitId: string) {
    const next = new Set(acknowledged);
    if (next.has(unitId)) next.delete(unitId);
    else next.add(unitId);
    setAcknowledged(next);
    setLoading(true);
    try {
      const updated = await api.qa(proposalId, Array.from(next));
      setReport(updated);
    } finally {
      setLoading(false);
    }
  }

  const tbdUnitIds = Array.from(
    new Set(report.issues.filter((i) => i.code === "tbd_rent" || i.code === "tbd_service_charge").map((i) => i.unit_id).filter(Boolean)),
  ) as string[];

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">§8 Data QA</h2>
        <Badge tone={report.is_export_ready ? "success" : "danger"}>
          {report.is_export_ready ? "Export ready" : "Not export ready"}
        </Badge>
      </div>
      <p className="mt-1 text-sm text-muted">
        {report.blocking_count} blocking · {report.warning_count} warning{report.warning_count === 1 ? "" : "s"}
        {loading && " · updating…"}
      </p>

      {tbdUnitIds.length > 0 && (
        <div className="mt-4 rounded-lg bg-background/60 p-3 text-sm">
          <p className="mb-2 font-medium">Acknowledge TBD units to allow export (explicit sign-off, §24):</p>
          {tbdUnitIds.map((unitId) => (
            <label key={unitId} className="flex items-center gap-2 py-1">
              <input type="checkbox" checked={acknowledged.has(unitId)} onChange={() => toggleAcknowledge(unitId)} />
              <span className="font-mono text-xs text-muted">{unitId.slice(0, 8)}</span>
            </label>
          ))}
        </div>
      )}

      <ul className="mt-4 space-y-2 text-sm">
        {report.issues.map((issue, i) => (
          <li key={i} className="flex items-start gap-2 border-b border-border/60 pb-2 last:border-none">
            <Badge tone={SEVERITY_TONE[issue.severity]}>{issue.severity}</Badge>
            <span className="text-muted">{issue.message}</span>
          </li>
        ))}
        {report.issues.length === 0 && <li className="text-muted">No issues found.</li>}
      </ul>
    </Card>
  );
}
