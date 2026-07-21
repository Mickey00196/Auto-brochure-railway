import { serverApi as api } from "@/lib/serverApi";
import { PageHeader } from "@/components/ui";
import { BuildingForm } from "@/components/BuildingForm";

export default async function NewBuildingPage() {
  const neighbourhoods = await api.neighbourhoods().catch(() => []);

  return (
    <div>
      <PageHeader
        eyebrow="§5.1 Building"
        title="Add Building"
        description="Writes to the exact same Building record a URL import produces — one schema, populated either by hand or by the scraper."
      />
      <BuildingForm neighbourhoods={neighbourhoods} />
    </div>
  );
}
