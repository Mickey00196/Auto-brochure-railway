import { PageHeader } from "@/components/ui";
import { ImportForm } from "@/components/ImportForm";
import { IngestionPanel } from "@/components/IngestionPanel";

export default function ImportPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Market data ingestion"
        title="Import Market Data"
        description="Enter search criteria and the backend automatically ingests matching office listings from permitted sources — discover, normalize, deduplicate, and store, with change history over time. Sources that don't permit automated access are skipped and shown as unavailable."
      />
      <IngestionPanel />

      <PageHeader
        eyebrow="Manual (single URLs)"
        title="Import specific URLs"
        description="Still available for one-off permitted listing URLs: paste them and each is fetched, parsed, and stored as Building/Unit records."
        showHomeLink={false}
      />
      <ImportForm />
    </div>
  );
}
