import { PageHeader } from "@/components/ui";
import { ImportForm } from "@/components/ImportForm";

export default function ImportPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Workflow 2 (§4 / §7)"
        title="Import from URLs"
        description="Paste one or more listing URLs. Each is scraped, its unit-level area subdivision preserved rather than collapsed (§7), and stored as Building/Unit records available to any future Proposal — no manual re-typing required."
      />
      <ImportForm />
    </div>
  );
}
