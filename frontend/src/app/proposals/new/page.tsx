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
        eyebrow="Step 3"
        title="New client PDF"
        description="Pick the client, tick the buildings that suit them, and generate their availability PDF."
      />

      {/* ProposalForm renders its own guidance (with links to add a client
          or building) when prerequisites are missing. */}
      <ProposalForm clients={clients} buildings={buildings} />
    </div>
  );
}
