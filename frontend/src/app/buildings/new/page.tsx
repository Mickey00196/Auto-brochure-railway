import Link from "next/link";
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
      <header className="mb-8 flex flex-col justify-between gap-5 border-b border-border pb-8 sm:flex-row sm:items-end">
        <div>
          <div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.13em] text-accent">
            <span className="size-2 rounded-sm bg-accent" />
            Building library <span className="normal-case tracking-normal text-muted">/ New building</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Add Building</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
            Captured by the Chrome extension — saved once, reusable across any client mandate.
          </p>
        </div>
        <Link href="/buildings" className="shrink-0 text-xs font-semibold text-accent hover:underline">
          Back to building library →
        </Link>
      </header>

      {isBlankForm && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/25 bg-accent/5 px-4 py-3 sm:px-5">
          <p className="text-sm">
            <strong>Looking at a listing right now?</strong> Skip typing it in — the bookmarklet reads it straight
            off the page and pre-fills this form, no extension install needed.
          </p>
          <Link
            href="/import#bookmarklet"
            className="shrink-0 text-xs font-semibold text-accent hover:underline"
          >
            Set up the bookmarklet →
          </Link>
        </div>
      )}

      <BuildingForm neighbourhoods={neighbourhoods} clients={clients} initial={initial} />
    </div>
  );
}
