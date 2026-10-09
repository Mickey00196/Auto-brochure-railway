import { PageHeader } from "@/components/ui";
import { ClientForm } from "@/components/ClientForm";

export default function NewClientPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Client"
        title="New client"
        description="Create a folder for whoever you're preparing an availability overview for. Once created, you'll browse your building library and add the ones that fit into their folder."
        backHref="/clients"
        backLabel="Back to clients"
      />
      <ClientForm />
    </div>
  );
}
