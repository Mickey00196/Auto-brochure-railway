import { PageHeader } from "@/components/ui";
import { ClientForm } from "@/components/ClientForm";

export default function NewClientPage() {
  return (
    <div>
      <PageHeader
        eyebrow="§5.5 Client"
        title="Add Client"
        description="A client is who a Proposal is prepared for — create one here, then select it when building a proposal."
      />
      <ClientForm />
    </div>
  );
}
