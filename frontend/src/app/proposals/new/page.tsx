import { serverApi as api } from "@/lib/serverApi";
import { PageHeader, Card } from "@/components/ui";
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

      {clients.length === 0 || buildings.length === 0 ? (
        <Card>
          You need at least one client and one building with units before creating a proposal. Load the reference
          brochure demo data from the dashboard, or create clients/buildings via the API.
        </Card>
      ) : (
        <ProposalForm clients={clients} buildings={buildings} />
      )}
    </div>
  );
}
