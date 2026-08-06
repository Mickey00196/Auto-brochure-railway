import { serverApi as api } from "@/lib/serverApi";
import { PageHeader } from "@/components/ui";
import { ProposalForm } from "@/components/ProposalForm";

export default async function NewProposalPage() {
  const [clients, buildings] = await Promise.all([
    api.clients().catch(() => []),
    api.buildings().catch(() => []),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="Workflow 1 (§4)"
        title="New Proposal"
        description="Select units — optionally across several buildings — and attach them to a client. PDF, PowerPoint, comparison table and one-pager will all generate from this one record."
      />

      {/* ProposalForm renders its own guidance (with links to add a client
          or building) when prerequisites are missing. */}
      <ProposalForm clients={clients} buildings={buildings} />
    </div>
  );
}
