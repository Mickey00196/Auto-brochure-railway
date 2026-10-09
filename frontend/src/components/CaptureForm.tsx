"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Car, Check, Pencil, Plane, Train, TriangleAlert, X } from "lucide-react";
import type { Client, DuplicateCandidate } from "@/lib/types";
import { api, PROXY_BASE_URL } from "@/lib/api";
import { PhotoPicker } from "@/components/PhotoPicker";
import { SUGGESTED_AMENITIES } from "@/components/AmenityMultiSelect";
import { useUnsavedChangesWarning } from "@/lib/useUnsavedChangesWarning";
import { floorLabel, floorRank, type CaptureFloor } from "@/lib/floors";
import { ENERGY_OPTIONS, energyColor } from "@/lib/energy";
import { splitDistance } from "@/lib/distance";

/** The page the Chrome extension opens (/buildings/new): the captured listing
 * laid out like a listing page you can edit in place — photos, the five
 * figures a broker compares on, sizes per floor, the rest, amenities and how
 * to get there — with one sticky Save bar. Editing a saved building still
 * uses BuildingForm; this is only for adding one. */

type Delivery = "turn_key" | "shell_and_core";

const EMPTY = {
  name: "",
  address: "",
  postalCode: "",
  city: "",
  submarket: "",
  yearBuilt: "",
  energyLabel: "",
  breeamRating: "",
  totalBuildingAreaM2: "",
  accessibilityNote: "",
  airportNote: "",
  publicTransportNote: "",
  latitude: "",
  longitude: "",
  buildingAmenities: [] as string[],
  photos: "",
  availableAreaM2: "",
  minDivisibleAreaM2: "",
  parkingRatio: "",
  rentEurPerM2Year: "",
  serviceChargeEurPerM2Year: "",
  parkingPriceEurYear: "",
  availability: "",
  delivery: "shell_and_core" as Delivery,
  floors: [] as CaptureFloor[],
};
type Form = typeof EMPTY;
export type CaptureInitial = Partial<Form>;

type TransportMode = "nearest_any" | "train" | "subway" | "tram" | "bus";
const TRANSPORT_MODE_LABELS: Record<TransportMode, string> = {
  nearest_any: "Any",
  train: "Train",
  subway: "Metro",
  tram: "Tram",
  bus: "Bus",
};

type KeyFigure = {
  key: "rentEurPerM2Year" | "serviceChargeEurPerM2Year" | "availableAreaM2" | "parkingRatio" | "parkingPriceEurYear";
  label: string;
  short: string;
  prefix?: string;
  unit: string;
  placeholder: string;
  numeric: boolean;
};
const KEY_FIGURES: KeyFigure[] = [
  { key: "rentEurPerM2Year", label: "Rent office space", short: "rent", prefix: "€", unit: "/m²/yr", placeholder: "245", numeric: true },
  { key: "serviceChargeEurPerM2Year", label: "Service charges", short: "service charges", prefix: "€", unit: "/m²/yr", placeholder: "45", numeric: true },
  { key: "availableAreaM2", label: "Total surface available", short: "surface available", unit: "m²", placeholder: "580", numeric: true },
  { key: "parkingRatio", label: "Parking ratio", short: "parking ratio", unit: "", placeholder: "1:100", numeric: false },
  { key: "parkingPriceEurYear", label: "Rent parking space", short: "parking price", prefix: "€", unit: "/space/yr", placeholder: "1,750", numeric: true },
];

/** "1.750", "1,750", "€ 243,50" → a number. Dutch and English grouping, the
 * same rule the extension uses: a separator followed by exactly three digits
 * groups thousands, otherwise it's the decimal point. */
export function toNumber(raw: string): number | null {
  const m = String(raw).match(/\d[\d.,]*\d|\d/);
  if (!m) return null;
  let t = m[0];
  if (t.includes(",") && t.includes(".")) {
    const dec = t.lastIndexOf(",") > t.lastIndexOf(".") ? "," : ".";
    t = t.split(dec === "," ? "." : ",").join("").replace(dec, ".");
  } else if (t.includes(",")) {
    t = t.split(",").join(t.split(",").pop()!.length === 3 ? "" : ".");
  } else if (t.includes(".")) {
    if (t.split(".").pop()!.length === 3) t = t.split(".").join("");
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/** "1750" → "1,750" for the big figures; anything that isn't a plain
 * number (a ratio, "on request") is left exactly as typed. */
function prettyNumber(raw: string): string {
  if (!/^[\s€\d.,]+$/.test(raw) || !/\d/.test(raw)) return raw;
  const n = toNumber(raw);
  return n == null ? raw : n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

// Spelling variants of one amenity (the extension says "Bicycle storage",
// the suggestion list "Bike storage"), so both never show as two pills.
const AMENITY_ALIASES: Record<string, string> = { "bike storage": "bicycle storage", "bike parking": "bicycle storage" };
const amenityKey = (a: string) => AMENITY_ALIASES[a.trim().toLowerCase()] ?? a.trim().toLowerCase();

async function describeFailedResponse(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") return body.detail;
  } catch {
    /* not JSON — fall through */
  }
  return `HTTP ${res.status}`;
}

const cardClass = "min-w-0 rounded-[20px] bg-surface p-5 shadow-card sm:p-7";
const rowInputClass =
  "h-10 w-full min-w-0 rounded-[10px] border border-transparent bg-input-bg px-3 text-[15px] font-medium text-foreground placeholder:font-normal placeholder:text-placeholder transition focus:border-accent focus:bg-surface focus:outline-none";
const srOnly = "sr-only";

export function CaptureForm({
  clients = [],
  initial,
  sourceUrl,
}: {
  clients?: Client[];
  initial?: CaptureInitial;
  /** The listing page the extension captured, saved as the building's source. */
  sourceUrl?: string;
}) {
  const router = useRouter();
  const start = { ...EMPTY, ...initial };
  for (const f of KEY_FIGURES) if (f.numeric) start[f.key] = prettyNumber(start[f.key]);
  const [form, setForm] = useState<Form>(start);
  const [initialSnapshot] = useState(() => JSON.stringify(start));
  useUnsavedChangesWarning(JSON.stringify(form) !== initialSnapshot);

  // A capture is any handoff that arrived with a name or address; only then
  // do empty key figures read as "the listing didn't say", in amber.
  const [wasCaptured] = useState(() => Boolean(initial?.name || initial?.address));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [duplicatesDismissed, setDuplicatesDismissed] = useState(false);

  function update<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // ── duplicates ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (duplicatesDismissed) return;
    if (!form.address.trim() || !form.city.trim()) {
      queueMicrotask(() => setDuplicates([]));
      return;
    }
    const timer = setTimeout(() => {
      api
        .checkDuplicateBuilding({
          address: form.address,
          city: form.city,
          postalCode: form.postalCode || undefined,
          name: form.name || undefined,
        })
        .then(setDuplicates)
        .catch(() => {
          /* a convenience — never block on it */
        });
    }, 500);
    return () => clearTimeout(timer);
  }, [form.address, form.city, form.postalCode, form.name, duplicatesDismissed]);

  // ── floors ─────────────────────────────────────────────────────────────
  const floorAreas = form.floors.map((f) => toNumber(f.area) ?? 0);
  const floorsTotal = floorAreas.reduce((a, b) => a + b, 0);
  const floorsDriveTotal = floorsTotal > 0;

  function setFloor(index: number, patch: Partial<CaptureFloor>) {
    setForm((prev) => ({
      ...prev,
      floors: prev.floors.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    }));
  }
  function addFloor() {
    setForm((prev) => {
      const ranks = prev.floors.map((f) => floorRank(f.floor)).filter((r) => r !== 99);
      const top = ranks.length ? Math.max(...ranks) : -1;
      return { ...prev, floors: [...prev.floors, { floor: floorLabel(top + 1), area: "" }] };
    });
  }
  function removeFloor(index: number) {
    setForm((prev) => ({ ...prev, floors: prev.floors.filter((_, i) => i !== index) }));
  }
  function startFloors() {
    setForm((prev) => ({
      ...prev,
      floors: [
        { floor: "Ground floor", area: "" },
        { floor: "1st floor", area: "" },
      ],
    }));
  }

  // ── key figures ────────────────────────────────────────────────────────
  const figureValue = (f: KeyFigure) =>
    f.key === "availableAreaM2" && floorsDriveTotal ? String(floorsTotal) : form[f.key];
  const missing = KEY_FIGURES.filter((f) => !String(figureValue(f)).trim());

  // ── amenities ──────────────────────────────────────────────────────────
  // Captured ones first, then the usual suspects. The list only ever grows,
  // so a pill never jumps when it's switched on or off.
  const [amenityOptions, setAmenityOptions] = useState<string[]>(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const a of [...start.buildingAmenities, ...SUGGESTED_AMENITIES]) {
      const k = amenityKey(a);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(a.trim());
    }
    return out;
  });
  const [addingAmenity, setAddingAmenity] = useState<string | null>(null);
  const isOn = (a: string) => form.buildingAmenities.some((v) => amenityKey(v) === amenityKey(a));
  function toggleAmenity(a: string) {
    update(
      "buildingAmenities",
      isOn(a)
        ? form.buildingAmenities.filter((v) => amenityKey(v) !== amenityKey(a))
        : [...form.buildingAmenities, a],
    );
  }
  function commitCustomAmenity() {
    const a = (addingAmenity ?? "").trim();
    setAddingAmenity(null);
    if (!a) return;
    if (!amenityOptions.some((o) => amenityKey(o) === amenityKey(a))) setAmenityOptions((prev) => [...prev, a]);
    if (!isOn(a)) update("buildingAmenities", [...form.buildingAmenities, a]);
  }

  // ── distances ──────────────────────────────────────────────────────────
  const [locating, setLocating] = useState(false);
  const [locateNote, setLocateNote] = useState<string | null>(null);
  const [transportMode, setTransportMode] = useState<TransportMode>("nearest_any");

  async function fetchDistances(mode: TransportMode) {
    const res = await fetch(`${PROXY_BASE_URL}/geo/distances`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: form.address,
        city: form.city,
        postal_code: form.postalCode || null,
        transport_mode: mode,
      }),
    });
    if (!res.ok) throw new Error(await describeFailedResponse(res));
    return (await res.json()) as {
      found: boolean;
      public_transport: string | null;
      highway: string | null;
      airport: string | null;
      latitude: number | null;
      longitude: number | null;
    };
  }

  /** overwrite=false (on open) only fills blanks — a distance the listing
   * stated beats a straight line. The explicit button replaces all three. */
  async function lookUpDistances(overwrite: boolean) {
    if (!form.address.trim() && !form.city.trim()) {
      setLocateNote("Fill in the address first.");
      return;
    }
    setLocating(true);
    setLocateNote(null);
    try {
      const d = await fetchDistances(transportMode);
      if (!d.found) {
        setLocateNote("Couldn't place that address on the map. Fill the distances in by hand.");
        return;
      }
      setForm((prev) => {
        const next = { ...prev };
        if (d.public_transport && (overwrite || !prev.publicTransportNote)) next.publicTransportNote = d.public_transport;
        if (d.highway && (overwrite || !prev.accessibilityNote)) next.accessibilityNote = d.highway;
        if (d.airport && (overwrite || !prev.airportNote)) next.airportNote = d.airport;
        if (d.latitude != null && d.longitude != null) {
          next.latitude = String(d.latitude);
          next.longitude = String(d.longitude);
        }
        return next;
      });
      if (overwrite) setLocateNote("Updated from the address. These are straight-line distances.");
    } catch (e) {
      setLocateNote(`Distance lookup failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLocating(false);
    }
  }

  async function changeTransportMode(mode: TransportMode) {
    setTransportMode(mode);
    if (!form.address.trim() && !form.city.trim()) return;
    setLocating(true);
    setLocateNote(null);
    try {
      const d = await fetchDistances(mode);
      if (d.public_transport) update("publicTransportNote", d.public_transport);
      else setLocateNote(`No ${TRANSPORT_MODE_LABELS[mode].toLowerCase()} stop found near this address.`);
    } catch (e) {
      setLocateNote(`Distance lookup failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLocating(false);
    }
  }

  // Once on open, so a fresh capture gets its distances without a click.
  const autoLookupRan = useRef(false);
  useEffect(() => {
    if (autoLookupRan.current) return;
    autoLookupRan.current = true;
    if ((form.address.trim() || form.city.trim()) && (!form.publicTransportNote || !form.accessibilityNote || !form.airportNote)) {
      queueMicrotask(() => lookUpDistances(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only by design
  }, []);

  // ── save ───────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.address.trim() || !form.city.trim()) {
      setError("Add a name, address and city first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const num = (s: string) => toNumber(s);
      const building = await api.createBuilding({
        name: form.name.trim(),
        address: form.address.trim(),
        postal_code: form.postalCode.trim() || null,
        city: form.city.trim(),
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        submarket: form.submarket.trim() || null,
        year_built: num(form.yearBuilt),
        energy_label: form.energyLabel || null,
        breeam_rating: form.breeamRating.trim() || null,
        total_building_area_m2: num(form.totalBuildingAreaM2),
        accessibility_note: form.accessibilityNote.trim() || null,
        airport_note: form.airportNote.trim() || null,
        public_transport_note: form.publicTransportNote.trim() || null,
        building_amenities: form.buildingAmenities,
        source_url: sourceUrl || null,
        photos: form.photos
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });

      // The space on offer: one unit per floor when sizes per floor were
      // given, otherwise a single unit — same terms on each.
      const rent = num(form.rentEurPerM2Year);
      const service = num(form.serviceChargeEurPerM2Year);
      const minDivisible = num(form.minDivisibleAreaM2);
      const hasTerms = Boolean(rent != null || service != null || form.parkingRatio.trim() || form.availability.trim());
      const pieces: { floor: string | null; area: number }[] = floorsDriveTotal
        ? form.floors
            .map((f, i) => ({ floor: f.floor.trim() || null, area: floorAreas[i] }))
            .filter((p) => p.area > 0)
        : (() => {
            const area = num(form.availableAreaM2) ?? num(form.totalBuildingAreaM2);
            return area && hasTerms ? [{ floor: form.floors[0]?.floor.trim() || null, area }] : [];
          })();

      const unitIds: string[] = [];
      for (const piece of pieces) {
        const unit = await api.createUnit({
          building_id: building.building_id,
          floor: piece.floor,
          available_area_m2: piece.area,
          min_divisible_area_m2: minDivisible != null && minDivisible < piece.area ? minDivisible : null,
          delivery_condition: form.delivery,
          rent_price_type: rent != null ? "fixed" : "tbd",
          rent_eur_per_m2_year: rent,
          service_charge_price_type: service != null ? "fixed" : "tbd",
          service_charge_eur_per_m2_year: service,
          parking_ratio: form.parkingRatio.trim() || null,
          availability: form.availability.trim() || null,
        });
        unitIds.push(unit.unit_id);
      }
      const parkingPrice = num(form.parkingPriceEurYear);
      if (parkingPrice != null && unitIds.length) {
        await api.createAddOn({
          name: "Parking space",
          price: parkingPrice,
          price_unit: "EUR / space / year",
          unit_id: unitIds[0],
          building_id: building.building_id,
        });
      }

      if (selectedClientId) {
        await api.copyBuildingToClient(building.building_id, selectedClientId);
        router.push(`/clients/${selectedClientId}`);
        return;
      }
      router.push(`/buildings?select=${building.building_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the building.");
      setSubmitting(false);
    }
  }

  // ── render ─────────────────────────────────────────────────────────────
  let sourceHost: string | null = null;
  try {
    sourceHost = sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, "") : null;
  } catch {
    sourceHost = null;
  }
  const draftMatch = duplicates.find((d) => d.is_draft);
  const energy = energyColor(form.energyLabel);
  const mapQuery =
    form.latitude && form.longitude
      ? `${form.latitude},${form.longitude}`
      : [form.address, form.postalCode, form.city].filter((s) => s.trim()).join(", ");
  // Floors are kept bottom-up (the page sorts a capture that way, and "Add
  // floor" stacks a new one on top), so the stack is simply that list
  // reversed — never re-sorted while someone is typing a floor name.
  const sortedFloorIndexes = form.floors.map((_, i) => i).reverse();

  return (
    <form onSubmit={handleSubmit} className="pb-2">
      {wasCaptured ? (
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-2xl bg-accent/10 px-4 py-3">
          <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm">
            <strong className="font-semibold">Captured from {sourceHost ?? "the listing"}.</strong>{" "}
            {missing.length
              ? `Not in the listing: ${missing.map((f) => f.short).join(", ")}. Add ${missing.length === 1 ? "it" : "them"} below.`
              : "Everything that matters was in the listing. Check it over, then save."}
          </p>
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-sm font-medium text-accent hover:underline"
            >
              Open the listing
            </a>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-accent/10 px-5 py-4">
          <p className="text-sm">
            <strong className="font-semibold">Looking at a listing right now?</strong> The bookmarklet reads it
            straight off the page and fills this in, no extension needed.
          </p>
          <Link href="/import#bookmarklet" className="shrink-0 text-sm font-medium text-accent hover:underline">
            Set up the bookmarklet
          </Link>
        </div>
      )}

      {duplicates.length > 0 && !duplicatesDismissed && (
        <div className="mt-4 rounded-2xl border border-amber-300/50 bg-warn-bg p-4 sm:p-5">
          <div className="flex items-start gap-2.5">
            <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warn-foreground" aria-hidden="true" />
            <p className="text-sm font-semibold text-warn-foreground">
              {draftMatch
                ? "There's an unfinished draft of this building. Consider completing that one instead."
                : `This looks like ${duplicates.length === 1 ? "a building" : `${duplicates.length} buildings`} already in your library:`}
            </p>
          </div>
          <ul className="mt-3 space-y-2 sm:pl-[26px]">
            {duplicates.map((d) => (
              <li key={d.building_id} className="flex items-center gap-3 rounded-xl bg-surface p-2.5">
                {d.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- arbitrary captured URLs
                  <img src={d.thumbnail_url} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
                ) : (
                  <div className="h-9 w-9 shrink-0 rounded-md bg-warn-foreground/15" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{d.name || d.address}</div>
                  <div className="truncate text-xs text-muted">
                    {d.address}
                    {d.is_draft ? ", draft without spaces" : `, ${d.space_count} space${d.space_count === 1 ? "" : "s"}`}
                  </div>
                </div>
                <Link href={`/buildings/${d.building_id}`} className="shrink-0 text-xs font-semibold text-accent hover:underline">
                  Open that one
                </Link>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setDuplicatesDismissed(true)}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-warn-foreground/80 underline hover:text-warn-foreground sm:ml-[26px]"
          >
            <X size={12} aria-hidden="true" />
            Not a duplicate, this is a different building
          </button>
        </div>
      )}

      <section aria-label="Photos" className="mt-5">
        <PhotoPicker value={form.photos} onChange={(next) => update("photos", next)} variant="gallery" />
      </section>

      <div className="mt-6">
        <label htmlFor="cap-name" className={srOnly}>
          Building name
        </label>
        <input
          id="cap-name"
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="Building name"
          className="-ml-2.5 w-[calc(100%+10px)] rounded-xl border border-transparent bg-transparent px-2.5 py-0.5 text-[32px] font-semibold tracking-[-0.035em] text-foreground placeholder:text-placeholder hover:border-border focus:border-accent focus:outline-none sm:text-[44px]"
        />
        <div className="-ml-2.5 mt-1 flex flex-wrap gap-2">
          <label htmlFor="cap-address" className={srOnly}>
            Address
          </label>
          <input
            id="cap-address"
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
            placeholder="Street and number"
            size={Math.max(16, form.address.length + 1)}
            className="min-w-0 max-w-full rounded-[10px] [field-sizing:content] border border-transparent bg-transparent px-2.5 py-1 text-base text-muted placeholder:text-placeholder hover:border-border focus:border-accent focus:text-foreground focus:outline-none"
          />
          <label htmlFor="cap-postal" className={srOnly}>
            Postal code
          </label>
          <input
            id="cap-postal"
            value={form.postalCode}
            onChange={(e) => update("postalCode", e.target.value)}
            placeholder="Postal code"
            size={Math.max(10, form.postalCode.length + 1)}
            className="min-w-0 max-w-full rounded-[10px] [field-sizing:content] border border-transparent bg-transparent px-2.5 py-1 text-base text-muted placeholder:text-placeholder hover:border-border focus:border-accent focus:text-foreground focus:outline-none"
          />
        </div>
      </div>

      <section aria-labelledby="cap-key" className="mt-7">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="cap-key" className="text-lg font-semibold tracking-[-0.02em]">
            Key figures
          </h2>
          <span className="text-[13px] text-muted">
            {KEY_FIGURES.length - missing.length} of {KEY_FIGURES.length} filled in
          </span>
        </div>
        <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
          {KEY_FIGURES.map((f) => {
            const value = String(figureValue(f));
            const isMissing = !value.trim();
            const amber = wasCaptured && isMissing;
            const readOnly = f.key === "availableAreaM2" && floorsDriveTotal;
            return (
              <div
                key={f.key}
                className={`rounded-[18px] px-[18px] pb-3.5 pt-4 ${
                  amber ? "border-[1.5px] border-dashed border-amber-400 bg-warn-bg/60" : "border-[1.5px] border-transparent bg-surface shadow-card"
                }`}
              >
                <label htmlFor={`cap-${f.key}`} className="flex justify-between gap-2 text-xs text-muted">
                  {f.label}
                  {amber && <span className="font-medium text-warn-foreground">Missing</span>}
                </label>
                <span className="mt-1.5 flex min-w-0 items-baseline">
                  {f.prefix && !isMissing && (
                    <span className="text-[26px] font-semibold tracking-[-0.02em]">
                      {f.prefix}
                    </span>
                  )}
                  <input
                    id={`cap-${f.key}`}
                    value={readOnly ? floorsTotal.toLocaleString("en-GB") : value}
                    readOnly={readOnly}
                    onChange={(e) => update(f.key, e.target.value)}
                    onBlur={f.numeric ? (e) => update(f.key, prettyNumber(e.target.value)) : undefined}
                    inputMode={f.numeric ? "decimal" : "text"}
                    placeholder={amber ? "Add" : f.placeholder}
                    size={Math.max(2, (value || (amber ? "Add" : f.placeholder)).length)}
                    className="min-w-0 max-w-full border-0 bg-transparent p-0 text-[26px] font-semibold tracking-[-0.02em] tabular-nums text-foreground [field-sizing:content] placeholder:font-medium placeholder:text-placeholder focus:outline-none read-only:cursor-default"
                  />
                  {f.unit && (
                    <span className="ml-1.5 shrink-0 text-xs text-muted">
                      {f.unit}
                      {readOnly && ", sum of floors"}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        {form.floors.length === 0 && (
          <button type="button" onClick={startFloors} className="mt-3 text-sm font-medium text-accent hover:underline">
            + Split the surface per floor
          </button>
        )}
      </section>

      <div className="mt-5 flex flex-col gap-5">
        {form.floors.length > 0 && (
          <section aria-labelledby="cap-floors" className={cardClass}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="cap-floors" className="text-lg font-semibold tracking-[-0.02em]">
                Available per floor
              </h2>
              {floorsDriveTotal && (
                <span className="text-[13px] text-muted tabular-nums">{floorsTotal.toLocaleString("en-GB")} m² in total</span>
              )}
            </div>
            <div className="mt-4 flex flex-col gap-1.5">
              <button
                type="button"
                onClick={addFloor}
                className="h-11 rounded-[10px] border-[1.5px] border-dashed border-border text-sm font-medium text-muted transition hover:border-accent hover:text-accent"
              >
                + Add floor
              </button>
              {sortedFloorIndexes.map((i, pos) => {
                const f = form.floors[i];
                // Darkest at street level, a touch lighter for each floor up.
                const shade = Math.max(55, 100 - (sortedFloorIndexes.length - 1 - pos) * 12);
                return (
                  <div
                    key={i}
                    className="group flex h-[58px] items-center gap-3 rounded-[10px] px-3 text-accent-foreground sm:px-5"
                    style={{ background: `color-mix(in srgb, var(--accent) ${shade}%, var(--surface))` }}
                  >
                    <label htmlFor={`cap-floor-${i}`} className={srOnly}>
                      Floor name
                    </label>
                    <input
                      id={`cap-floor-${i}`}
                      value={f.floor}
                      onChange={(e) => setFloor(i, { floor: e.target.value })}
                      className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[15px] font-medium text-accent-foreground placeholder:text-accent-foreground/60 hover:border-accent-foreground/30 focus:border-accent-foreground/60 focus:outline-none"
                    />
                    <label htmlFor={`cap-floor-area-${i}`} className={srOnly}>
                      Size of {f.floor || "this floor"} in m²
                    </label>
                    <input
                      id={`cap-floor-area-${i}`}
                      value={f.area}
                      onChange={(e) => setFloor(i, { area: e.target.value })}
                      inputMode="decimal"
                      placeholder="0"
                      className="w-24 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-right text-2xl font-semibold tracking-[-0.02em] tabular-nums text-accent-foreground placeholder:text-accent-foreground/50 hover:border-accent-foreground/30 focus:border-accent-foreground/60 focus:outline-none"
                    />
                    <span className="text-sm text-accent-foreground/75">m²</span>
                    <button
                      type="button"
                      onClick={() => removeFloor(i)}
                      aria-label={`Remove ${f.floor || "this floor"}`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-accent-foreground/70 transition hover:bg-black/10 hover:text-accent-foreground"
                    >
                      <X size={15} aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
              <span className="mt-0.5 h-1 rounded-sm bg-foreground" aria-hidden="true" />
            </div>
          </section>
        )}

        <section aria-labelledby="cap-details" className={cardClass}>
          <h2 id="cap-details" className="text-lg font-semibold tracking-[-0.02em]">
            Other details
          </h2>
          <dl className="mt-3.5">
            <DetailRow label="City" htmlFor="cap-city" required>
              <input id="cap-city" value={form.city} onChange={(e) => update("city", e.target.value)} placeholder="Amsterdam" className={rowInputClass} />
            </DetailRow>
            <DetailRow label="Subarea" htmlFor="cap-submarket">
              <input id="cap-submarket" value={form.submarket} onChange={(e) => update("submarket", e.target.value)} placeholder="Optional" className={rowInputClass} />
            </DetailRow>
            <DetailRow label="Rentable from" htmlFor="cap-min">
              <UnitInput id="cap-min" value={form.minDivisibleAreaM2} onChange={(v) => update("minDivisibleAreaM2", v)} unit="m²" />
            </DetailRow>
            <DetailRow label="Delivery">
              <div role="radiogroup" aria-label="Delivery" className="grid grid-cols-2 gap-[3px] rounded-[10px] bg-input-bg p-[3px]">
                {(
                  [
                    ["turn_key", "Turn-key"],
                    ["shell_and_core", "Shell & core"],
                  ] as const
                ).map(([value, label]) => {
                  const on = form.delivery === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => update("delivery", value)}
                      className={`h-[34px] rounded-lg text-sm font-medium transition ${
                        on ? "bg-surface text-foreground shadow-[0_1px_2px_rgba(15,27,51,0.12)]" : "text-muted hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </DetailRow>
            <DetailRow label="Energy rating" htmlFor="cap-energy">
              <span className="flex items-center gap-2.5">
                {energy && (
                  <span
                    className="flex h-[30px] min-w-[30px] shrink-0 items-center justify-center rounded-lg px-1.5 text-sm font-bold"
                    style={{ background: energy.bg, color: energy.fg }}
                  >
                    {form.energyLabel}
                  </span>
                )}
                <select
                  id="cap-energy"
                  value={form.energyLabel}
                  onChange={(e) => update("energyLabel", e.target.value)}
                  className={rowInputClass}
                >
                  <option value="">Not known</option>
                  {ENERGY_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                  {form.energyLabel && !ENERGY_OPTIONS.includes(form.energyLabel) && (
                    <option value={form.energyLabel}>{form.energyLabel}</option>
                  )}
                </select>
              </span>
            </DetailRow>
            <DetailRow label="Year of construction" htmlFor="cap-year">
              <input id="cap-year" value={form.yearBuilt} onChange={(e) => update("yearBuilt", e.target.value)} inputMode="numeric" placeholder="Optional" className={rowInputClass} />
            </DetailRow>
            <DetailRow label="Available from" htmlFor="cap-avail">
              <input id="cap-avail" value={form.availability} onChange={(e) => update("availability", e.target.value)} placeholder="Per direct" className={rowInputClass} />
            </DetailRow>
            <DetailRow label="Total building area" htmlFor="cap-total">
              <UnitInput id="cap-total" value={form.totalBuildingAreaM2} onChange={(v) => update("totalBuildingAreaM2", v)} unit="m²" />
            </DetailRow>
            <DetailRow label="BREEAM rating" htmlFor="cap-breeam">
              <input id="cap-breeam" value={form.breeamRating} onChange={(e) => update("breeamRating", e.target.value)} placeholder="Optional" className={rowInputClass} />
            </DetailRow>
          </dl>
        </section>

        <section aria-labelledby="cap-amenities" className={cardClass}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
            <div className="flex items-baseline gap-2.5">
              <h2 id="cap-amenities" className="text-lg font-semibold tracking-[-0.02em]">
                Amenities
              </h2>
              <span className="text-[13px] text-muted">{form.buildingAmenities.length} selected</span>
            </div>
            <span className="text-[13px] text-muted">Click to add or remove</span>
          </div>
          <div className="mt-3.5 flex flex-wrap gap-2">
            {amenityOptions.map((a) => {
              const on = isOn(a);
              return (
                <button
                  key={a}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleAmenity(a)}
                  className={`inline-flex h-[34px] items-center gap-1.5 rounded-full border pl-2.5 pr-3.5 text-[13px] font-medium transition ${
                    on
                      ? "border-dark bg-dark text-white"
                      : "border-border bg-surface text-foreground/80 hover:border-accent hover:text-accent"
                  }`}
                >
                  {on ? <Check size={13} strokeWidth={2.4} aria-hidden="true" /> : <span aria-hidden="true" className="w-[13px] text-center text-muted">+</span>}
                  {a}
                </button>
              );
            })}
            {addingAmenity === null ? (
              <button
                type="button"
                onClick={() => setAddingAmenity("")}
                className="h-[34px] rounded-full border border-dashed border-border px-3.5 text-[13px] font-medium text-muted transition hover:border-accent hover:text-accent"
              >
                + Add your own
              </button>
            ) : (
              <input
                autoFocus
                value={addingAmenity}
                onChange={(e) => setAddingAmenity(e.target.value)}
                onBlur={commitCustomAmenity}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitCustomAmenity();
                  } else if (e.key === "Escape") {
                    setAddingAmenity(null);
                  }
                }}
                aria-label="New amenity"
                placeholder="Type and press Enter"
                className="h-[34px] w-48 rounded-full border border-accent bg-surface px-3.5 text-[13px] focus:outline-none"
              />
            )}
          </div>
        </section>

        <section aria-labelledby="cap-access" className={cardClass}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
            <h2 id="cap-access" className="text-lg font-semibold tracking-[-0.02em]">
              Getting there
            </h2>
            <span className="text-[13px] text-muted">Straight-line distances, worked out from the address</span>
          </div>
          <div className="mt-4 grid gap-5 lg:grid-cols-3">
            <div className="relative min-h-[300px] overflow-hidden rounded-2xl bg-input-bg lg:col-span-2 lg:min-h-[360px]">
              {mapQuery ? (
                <iframe
                  title="Building location"
                  className="absolute inset-0 h-full w-full"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=15&output=embed`}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
                  The map appears once there&apos;s an address
                </div>
              )}
            </div>
            <div className="flex flex-col gap-3">
              <DistanceCard icon={<Car size={20} strokeWidth={1.6} />} label="Highway" value={form.accessibilityNote} onChange={(v) => update("accessibilityNote", v)} placeholder="A10 3 km" />
              <DistanceCard icon={<Plane size={20} strokeWidth={1.6} />} label="Airport" value={form.airportNote} onChange={(v) => update("airportNote", v)} placeholder="Schiphol 15 km" />
              <DistanceCard
                icon={<Train size={20} strokeWidth={1.6} />}
                label={transportMode === "nearest_any" ? "Public transport" : TRANSPORT_MODE_LABELS[transportMode]}
                value={form.publicTransportNote}
                onChange={(v) => update("publicTransportNote", v)}
                placeholder="Sloterdijk 500 m"
              />
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="cap-mode" className="text-[13px] text-muted">
                  Nearest stop by
                </label>
                <select
                  id="cap-mode"
                  value={transportMode}
                  disabled={locating}
                  onChange={(e) => changeTransportMode(e.target.value as TransportMode)}
                  className="h-[34px] rounded-[10px] border border-border bg-surface px-2.5 text-[13px] font-medium"
                >
                  {(Object.entries(TRANSPORT_MODE_LABELS) as [TransportMode, string][]).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={locating}
                  onClick={() => lookUpDistances(true)}
                  className="ml-auto h-[34px] rounded-full border border-border bg-surface px-3 text-[13px] font-medium transition hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  {locating ? "Looking up…" : "Look up again"}
                </button>
              </div>
              {locateNote && <p className="text-xs text-accent">{locateNote}</p>}
            </div>
          </div>
        </section>
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 mt-8 bg-gradient-to-t from-background from-70% to-transparent px-4 pb-4 pt-5 sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12">
        <div className="flex flex-wrap items-center gap-2.5 rounded-[18px] bg-dark py-2 pl-5 pr-2 text-white shadow-float">
          <span className="py-2 text-sm" role={error ? "alert" : undefined}>
            {error ? (
              <span className="font-medium text-amber-200">{error}</span>
            ) : missing.length ? (
              <>
                <strong className="font-semibold">
                  {missing.length} key figure{missing.length === 1 ? "" : "s"}
                </strong>{" "}
                still empty
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Check size={15} aria-hidden="true" /> All key figures filled in
              </span>
            )}
          </span>
          {clients.length > 0 && (
            <label className="hidden items-center gap-2.5 text-sm text-white/80 sm:ml-4 sm:inline-flex">
              Also add to
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="h-10 max-w-[200px] rounded-xl border-0 bg-white/12 px-3 text-sm font-medium text-white [&>option]:text-foreground"
              >
                <option value="">Library only</option>
                {[...clients]
                  .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
                  .map((c) => (
                    <option key={c.client_id} value={c.client_id}>
                      {c.display_name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <span className="ml-auto flex gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => router.push("/buildings")}
              className="h-10 rounded-xl border border-white/30 px-4 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-50"
            >
              Discard
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-white px-[18px] text-sm font-semibold text-dark transition hover:bg-white/90 disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Save building"}
            </button>
          </span>
        </div>
      </div>
    </form>
  );
}

function DetailRow({
  label,
  htmlFor,
  required = false,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid items-center gap-1.5 border-t border-input-bg py-2 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-3">
      <dt className="text-sm text-muted">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}
        {required && <span className="ml-0.5 text-accent">*</span>}
      </dt>
      <dd className="m-0 min-w-0">{children}</dd>
    </div>
  );
}

function UnitInput({ id, value, onChange, unit }: { id: string; value: string; onChange: (v: string) => void; unit: string }) {
  return (
    <span className="relative block">
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" placeholder="Optional" className={`${rowInputClass} pr-12`} />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">{unit}</span>
    </span>
  );
}

/** One distance as a card — the figure big, the place under it — that turns
 * into a plain text field on click. */
function DistanceCard({
  icon,
  label,
  value,
  onChange,
  placeholder,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [editing, setEditing] = useState(false);
  const { place, value: figure } = splitDistance(value);
  return (
    <div className="flex flex-1 items-center gap-4 rounded-2xl bg-background px-4 py-4 sm:px-5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface text-accent" aria-hidden="true">
        {icon}
      </span>
      {editing ? (
        <span className="min-w-0 flex-1">
          <label className="block text-[13px] text-muted">
            {label}
            <input
              autoFocus
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onBlur={() => setEditing(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") {
                  e.preventDefault();
                  setEditing(false);
                }
              }}
              placeholder={placeholder}
              className="mt-1 h-9 w-full rounded-lg border border-accent bg-surface px-2.5 text-[15px] font-medium text-foreground focus:outline-none"
            />
          </label>
        </span>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="group flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] text-muted">{label}</span>
            <span className={`mt-0.5 line-clamp-2 block text-[15px] font-medium leading-snug ${place ? "" : "text-placeholder"}`}>
              {place || (value ? "" : "Not found yet")}
            </span>
          </span>
          {figure && <span className="shrink-0 text-[26px] font-semibold tracking-[-0.02em] tabular-nums">{figure}</span>}
          <Pencil size={14} className="shrink-0 text-muted opacity-0 transition group-hover:opacity-100" aria-label={`Edit ${label.toLowerCase()}`} />
        </button>
      )}
    </div>
  );
}
