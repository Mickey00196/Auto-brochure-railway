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
  // Executive-summary fields the extension capture also extracts —
  // building-level…
  "submarket",
  "accessibilityNote",
  "airportNote",
  "publicTransportNote",
  // …and lease-terms fields that become the building's first Unit (plus a
  // parking AddOn) on submit — see BuildingForm.
  "availableAreaM2",
  "parkingRatio",
  "rentEurPerM2Year",
  "serviceChargeEurPerM2Year",
  "parkingPriceEurYear",
  "availability",
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
        eyebrow="Step 1"
        title="Add Building"
        description="Captured by the Chrome extension, pulled from a link, or typed in by hand — it all lands here and is saved for reuse with any client."
      />
      <BuildingForm neighbourhoods={neighbourhoods} initial={initial} />
    </div>
  );
}
