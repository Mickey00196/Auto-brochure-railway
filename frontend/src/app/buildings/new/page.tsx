import { serverApi as api } from "@/lib/serverApi";
import { PageHeader } from "@/components/ui";
import { BuildingForm, type BuildingFormInitial } from "@/components/BuildingForm";

// Fields the bookmarklet (see /import) can pre-fill via query params — it
// reads the Funda page you're already viewing in your own browser and opens
// this form with what it found, for you to review and submit. Only these
// keys are read; anything else in the URL is ignored.
const PREFILL_KEYS: (keyof BuildingFormInitial)[] = [
  "name",
  "address",
  "postalCode",
  "city",
  "buildingType",
  "yearBuilt",
  "energyLabel",
  "totalBuildingAreaM2",
  "buildingAmenities",
  "description",
  "photos",
];

export default async function NewBuildingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const neighbourhoods = await api.neighbourhoods().catch(() => []);
  const params = await searchParams;

  const initial: BuildingFormInitial = {};
  for (const key of PREFILL_KEYS) {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value) initial[key] = value;
  }

  return (
    <div>
      <PageHeader
        eyebrow="§5.1 Building"
        title="Add Building"
        description="Writes to the exact same Building record a URL import produces — one schema, populated either by hand or by the scraper."
      />
      <BuildingForm neighbourhoods={neighbourhoods} initial={initial} />
    </div>
  );
}
