import { notFound } from "next/navigation";
import { serverApi as api } from "@/lib/serverApi";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ComparisonTable } from "@/components/ComparisonTable";
import { ProposalWorkspace } from "@/components/ProposalWorkspace";
import { formatArea, formatUnitHeadlinePrice } from "@/lib/format";

export default async function ProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [proposal, comparison, qa] = await Promise.all([
    api.proposal(id).catch(() => null),
    api.comparison(id).catch(() => []),
    api.qa(id).catch(() => null),
  ]);

  if (!proposal) notFound();

  return (
    <div>
      <PageHeader
        eyebrow={`Prepared for ${proposal.client.company_name}`}
        title={proposal.title}
        description={proposal.notes ?? undefined}
        actions={<Badge tone="accent">{proposal.status.replace("_", " ")}</Badge>}
      />

      <Card className="mb-6">
        <h2 className="text-lg font-semibold">Selected Units ({proposal.selected_units.length})</h2>
        <div className="mt-4 space-y-2">
          {proposal.selected_units.map((unit, i) => (
            <div key={unit.unit_id} className="flex items-center justify-between border-b border-border/60 py-2 text-sm last:border-none">
              <span>
                <span className="mr-2 font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
                {unit.building?.name} — {unit.floor ?? "Unit"} · {formatArea(unit.available_area_m2)}
              </span>
              <span className="text-muted">{formatUnitHeadlinePrice(unit)}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="mb-6">
        <ComparisonTable rows={comparison} />
      </div>

      {qa && <ProposalWorkspace proposalId={proposal.proposal_id} proposalTitle={proposal.title} initialQAReport={qa} />}
    </div>
  );
}
