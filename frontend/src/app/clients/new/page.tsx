import { PageHeader } from "@/components/ui";
import { ClientForm } from "@/components/ClientForm";

export default function NewClientPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Client"
        title="Add Client"
        description="Add whoever you're preparing an availability overview for. You'll pick them when you build the PDF."
      />
      <ClientForm />
    </div>
  );
}
