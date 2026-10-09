import { serverApi as api } from "@/lib/serverApi";
import { CaptureForm, type CaptureInitial } from "@/components/CaptureForm";
import { parseFloorsParam } from "@/lib/floors";

// Fields the Chrome extension and the bookmarklet (see /import) can pre-fill
// via query params — read off the listing you're viewing, for you to check
// and save. Only these keys are read; anything else in the URL is ignored.
const PREFILL_TEXT_KEYS = [
  "name",
  "address",
  "postalCode",
  "city",
  "yearBuilt",
  "energyLabel",
  "totalBuildingAreaM2",
  "photos",
  "submarket",
  "accessibilityNote",
  "airportNote",
  "publicTransportNote",
  "availableAreaM2",
  "minDivisibleAreaM2",
  "parkingRatio",
  "rentEurPerM2Year",
  "serviceChargeEurPerM2Year",
  "parkingPriceEurYear",
  "availability",
] as const satisfies readonly (keyof CaptureInitial)[];

const first = (raw: string | string[] | undefined) => (Array.isArray(raw) ? raw[0] : raw);

export default async function NewBuildingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // This is the page the extension opens, so it must paint fast: the client
  // list only feeds the optional "Also add to" picker, so a slow backend
  // costs an empty picker (1.5s cap), never a blank tab.
  const [clients, params] = await Promise.all([
    Promise.race([
      api.clients().catch(() => []),
      new Promise<never[]>((resolve) => setTimeout(() => resolve([]), 1500)),
    ]),
    searchParams,
  ]);

  const initial: CaptureInitial = {};
  for (const key of PREFILL_TEXT_KEYS) {
    const value = first(params[key]);
    if (value) initial[key] = value;
  }
  const amenities = first(params.buildingAmenities);
  if (amenities) {
    initial.buildingAmenities = amenities
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const delivery = first(params.delivery);
  if (delivery === "turn_key" || delivery === "shell_and_core") initial.delivery = delivery;
  const floors = parseFloorsParam(first(params.floors));
  // Sizes per floor only make sense when the listing split the space up.
  if (floors.length >= 2) initial.floors = floors;

  const source = first(params.sourceUrl);
  const sourceUrl = source && /^https?:\/\//i.test(source) ? source : undefined;

  return <CaptureForm clients={clients} initial={initial} sourceUrl={sourceUrl} />;
}
