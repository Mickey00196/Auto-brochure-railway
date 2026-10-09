import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { serverApi as api } from "@/lib/serverApi";
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
  // neighbourhood dropdown and the client list are both optional metadata,
  // but awaiting either blocked the whole form behind a backend round-trip —
  // up to the 10s serverApi timeout when the backend is cold, which reads as
  // "the extension is slow". Cap both: a slow backend costs an empty
  // dropdown, not a blank tab.
  const [neighbourhoods, clients] = await Promise.all([
    Promise.race([
      api.neighbourhoods().catch(() => []),
      new Promise<never[]>((resolve) => setTimeout(() => resolve([]), 1500)),
    ]),
    Promise.race([
      api.clients().catch(() => []),
      new Promise<never[]>((resolve) => setTimeout(() => resolve([]), 1500)),
    ]),
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

  // Nothing came in via query params — a blank form, not a capture handoff.
  // This is exactly the moment someone's about to type a whole listing in by
  // hand, so it's the right place to point at the faster, no-install way to
  // grab it straight off the page instead.
  const isBlankForm = !initial.name && !initial.address;

  return (
    <div>
      <PageHeader
        eyebrow="Library"
        title="Add building"
        description={
          isBlankForm
            ? "Fill in what you know — everything can be edited later."
            : "Captured from the listing. Check the details, then save it to your library."
        }
        backHref="/buildings"
        backLabel="Library"
      />

      {isBlankForm && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-accent/10 px-5 py-4">
          <p className="text-sm">
            <strong className="font-semibold">Looking at a listing right now?</strong> The bookmarklet reads it straight
            off the page and fills in this form, no extension needed.
          </p>
          <Link href="/import#bookmarklet" className="shrink-0 text-sm font-medium text-accent hover:underline">
            Set up the bookmarklet
          </Link>
        </div>
      )}

      <BuildingForm neighbourhoods={neighbourhoods} clients={clients} initial={initial} />
    </div>
  );
}
