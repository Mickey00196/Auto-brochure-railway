"use client";

import { useState } from "react";
import type { QAReport } from "@/lib/types";
import { QAPanel } from "@/components/QAPanel";
import { ExportPanel } from "@/components/ExportPanel";
import { Card } from "@/components/ui";

export function ProposalWorkspace({
  proposalId,
  proposalTitle,
  initialQAReport,
}: {
  proposalId: string;
  proposalTitle: string;
  initialQAReport: QAReport;
}) {
  const [exportReady, setExportReady] = useState(initialQAReport.is_export_ready);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <QAPanel proposalId={proposalId} initialReport={initialQAReport} onReadyChange={setExportReady} />
      <Card>
        <h2 className="text-lg font-semibold">§13-15 / §20 Export</h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          PowerPoint is the primary generation target (§14); PDF is a flattened export of the same slides.
        </p>
        <ExportPanel proposalId={proposalId} proposalTitle={proposalTitle} exportReady={exportReady} />
      </Card>
    </div>
  );
}
