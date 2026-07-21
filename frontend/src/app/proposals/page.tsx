import Link from "next/link";
import { serverApi as api } from "@/lib/serverApi";
import { Badge, Card, PageHeader, Button } from "@/components/ui";

const STATUS_TONE: Record<string, "default" | "accent" | "warn" | "success"> = {
  draft: "default",
  sent: "accent",
  under_review: "warn",
  closed: "success",
};

export default async function ProposalsPage() {
  const [proposals, clients] = await Promise.all([
    api.proposals().catch(() => []),
    api.clients().catch(() => []),
  ]);
  const clientById = new Map(clients.map((c) => [c.client_id, c]));

  return (
    <div>
      <PageHeader
        eyebrow="§5.6 Proposal"
        title="Proposals"
        description="Every PDF, PowerPoint, comparison table and one-pager is generated from a single Proposal record, so all outputs stay in sync (Workflow 1, §4)."
        actions={
          <Link href="/proposals/new">
            <Button>New Proposal</Button>
          </Link>
        }
      />

      {proposals.length === 0 && (
        <Card>
          No proposals yet.{" "}
          <Link href="/proposals/new" className="text-accent hover:underline">
            Create one
          </Link>{" "}
          or load the reference brochure demo data from the dashboard.
        </Card>
      )}

      <div className="space-y-4">
        {proposals.map((p) => (
          <Link key={p.proposal_id} href={`/proposals/${p.proposal_id}`}>
            <Card className="transition hover:border-accent/50">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{p.title}</h2>
                  <p className="text-sm text-muted">
                    {clientById.get(p.client_id)?.company_name ?? "Unknown client"} · {p.selected_unit_ids.length}{" "}
                    location{p.selected_unit_ids.length === 1 ? "" : "s"} · prepared by {p.prepared_by ?? "—"}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[p.status] ?? "default"}>{p.status.replace("_", " ")}</Badge>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
