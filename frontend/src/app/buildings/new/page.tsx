import { serverApi as api } from "@/lib/serverApi";
import { PageHeader } from "@/components/ui";
import { BuildingForm, type BuildingFormInitial } from "@/components/BuildingForm";

// Fields the bookmarklet (see /import) can pre-fill via query params — it
// reads the Funda page you're already viewing in your own browser and opens
// this form with what it found, for you to review and submit. Only these
// keys are read; anything else in the URL is ignored. (No "description" key
// here on purpose — the redesigned Building card dropped that field, so a
// bookmarklet/extension URL that still sends one is just silently ignored.)
const PREFILL_TEXT_KEYS: Exclude<keyof BuildingFormInitial, "buildingAmenities">[] = [
  "name",
  "address",
  "postalCode",
  "city",
  "buildingType",
  "yearBuilt",
  "energyLabel",
  "totalBuildingAreaM2",
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
  "minDivisibleAreaM2",
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
  // This is the page the Chrome extension opens, so it must paint fast. The
  // neighbourhood dropdown is optional metadata, but awaiting it blocked the
  // whole form behind a backend round-trip — up to the 10s serverApi timeout
  // when the backend is cold, which reads as "the extension is slow". Cap it:
  // a slow backend costs an empty dropdown, not a blank tab.
  const neighbourhoods = await Promise.race([
    api.neighbourhoods().catch(() => []),
    new Promise<never[]>((resolve) => setTimeout(() => resolve([]), 1500)),
  ]);
  const params = await searchParams;

  const initial: BuildingFormInitial = {};
  for (const key of PREFILL_TEXT_KEYS) {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value) initial[key] = value;
  }
  const rawAmenities = params.buildingAmenities;
  const amenitiesParam = Array.isArray(rawAmenities) ? rawAmenities[0] : rawAmenities;
  if (amenitiesParam) {
    initial.buildingAmenities = amenitiesParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return (
    <div>
      <PageHeader
        eyebrow="§5.1 · Buildings & Units"
        title="Add Building"
        description="Captured by the Chrome extension — saved once, reusable across any client mandate."
      />
      <BuildingForm neighbourhoods={neighbourhoods} initial={initial} />
    </div>
  );
}
