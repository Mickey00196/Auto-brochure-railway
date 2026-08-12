"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { DuplicateCandidate, Neighbourhood } from "@/lib/types";
import { api } from "@/lib/api";
import { Badge, Button, Card, fieldInputClass, fieldLabelClass } from "@/components/ui";
import { PhotoPicker } from "@/components/PhotoPicker";
import { AmenityMultiSelect } from "@/components/AmenityMultiSelect";
import { PROXY_BASE_URL } from "@/lib/api";

const inputClass = fieldInputClass;
const labelClass = fieldLabelClass;
const selectClass =
  "rounded-[10px] border border-transparent bg-input-bg px-2 text-sm text-foreground transition focus:border-accent focus:bg-surface focus:outline-none";

type TransportMode = "nearest_any" | "train" | "subway" | "tram" | "bus";
const TRANSPORT_MODE_LABELS: Record<TransportMode, string> = {
  nearest_any: "Nearest (any)",
  train: "Train",
  subway: "Metro",
  tram: "Tram",
  bus: "Bus",
};

/** A non-2xx response's body is usually FastAPI's {"detail": "..."} (a
 * validation error, or an HTTPException) — surface that instead of just the
 * status code, so a failure is actually diagnosable from the UI rather than
 * generic "unavailable" text that looks identical for every possible cause. */
async function describeFailedResponse(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const detail = body?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length) {
      // FastAPI's 422 shape: a list of {loc, msg, type}.
      return detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join("; ") || `HTTP ${res.status}`;
    }
  } catch {
    // Body wasn't JSON (e.g. an HTML error page from a proxy/gateway) — fall
    // through to the status-only message below.
  }
  return `HTTP ${res.status}`;
}

const EMPTY_FORM = {
  name: "",
  address: "",
  postalCode: "",
  city: "",
  neighbourhoodId: "",
  submarket: "",
  buildingType: "",
  yearBuilt: "",
  energyLabel: "",
  breeamRating: "",
  totalBuildingAreaM2: "",
  accessibilityNote: "",
  airportNote: "",
  publicTransportNote: "",
  // The API (backend/app/schemas.py) has always taken building_amenities as
  // a JSON array, not a comma-joined string — the old comma-separated text
  // field was a frontend-only simplification. AmenityMultiSelect operates on
  // the array directly now, no split()/join() layer needed.
  buildingAmenities: [] as string[],
  photos: "",
  // Executive summary — lease terms. These live on the building's first
  // Unit (and a parking AddOn), created together with the Building on
  // submit so a captured listing lands complete, not as a shell.
  availableAreaM2: "",
  minDivisibleAreaM2: "",
  parkingRatio: "",
  rentEurPerM2Year: "",
  serviceChargeEurPerM2Year: "",
  parkingPriceEurYear: "",
  availability: "",
};

/** Subset of form fields the bookmarklet / query-param prefill can seed —
 * see buildings/new/page.tsx. */
export type BuildingFormInitial = Partial<typeof EMPTY_FORM>;

export function BuildingForm({
  neighbourhoods,
  initial,
  buildingId,
}: {
  neighbourhoods: Neighbourhood[];
  initial?: BuildingFormInitial;
  /** Set when editing a saved building: updates in place instead of adding a
   * new one, and hides the capture/lease-terms sections (capture belongs to
   * a new building, and units are managed on the building's own page — an
   * edit must never silently create a second unit). */
  buildingId?: string;
}) {
  const isEdit = Boolean(buildingId);
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial });
  const [locating, setLocating] = useState(false);
  const [locateNote, setLocateNote] = useState<string | null>(null);
  const [transportMode, setTransportMode] = useState<TransportMode>("nearest_any");
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [duplicatesDismissed, setDuplicatesDismissed] = useState(false);

  // Debounced "does this already exist?" check — only for a genuinely new
  // building (editing one obviously matches itself) and only once there's
  // enough to check against. This is the manual-form half of duplicate
  // detection; POST /imports/urls (the bulk importer) does its own check
  // server-side since that path has no human typing to debounce against.
  useEffect(() => {
    if (isEdit || duplicatesDismissed) return;
    if (!form.address.trim() || !form.city.trim()) {
      // Deferred a tick (queueMicrotask): a synchronous setState call in the
      // effect body trips react-hooks/set-state-in-effect (cascading-render
      // risk) — same pattern as the distance-lookup effect above.
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
          /* the warning is a convenience — never block typing on it */
        });
    }, 500);
    return () => clearTimeout(timer);
  }, [form.address, form.city, form.postalCode, form.name, isEdit, duplicatesDismissed]);

  /** Fill the three transport distances from the address. Only ever fills
   * blanks — a figure the listing itself stated (or one typed by hand) is
   * more authoritative than a straight line on a map, so it is never
   * overwritten. */
  async function lookUpDistances() {
    if (!form.address.trim() && !form.city.trim()) {
      setLocateNote("Fill in the address first.");
      return;
    }
    setLocating(true);
    setLocateNote(null);
    try {
      const res = await fetch(`${PROXY_BASE_URL}/geo/distances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: form.address,
          city: form.city,
          postal_code: form.postalCode || null,
          transport_mode: transportMode,
        }),
      });
      if (!res.ok) throw new Error(await describeFailedResponse(res));
      const d = (await res.json()) as {
        found: boolean;
        public_transport: string | null;
        highway: string | null;
        airport: string | null;
      };
      if (!d.found) {
        setLocateNote("Couldn't place that address on the map — fill the distances in by hand.");
        return;
      }
      // Work out the changes from the current state up front. Deciding this
      // inside the setForm updater looked equivalent but isn't: the updater
      // runs after this function continues, so the message below was built
      // from an empty list and always claimed nothing had been filled.
      const patch: Partial<typeof form> = {};
      const filled: string[] = [];
      if (!form.publicTransportNote && d.public_transport) {
        patch.publicTransportNote = d.public_transport;
        filled.push("public transport");
      }
      if (!form.accessibilityNote && d.highway) {
        patch.accessibilityNote = d.highway;
        filled.push("highway");
      }
      if (!form.airportNote && d.airport) {
        patch.airportNote = d.airport;
        filled.push("airport");
      }
      if (filled.length) setForm((prev) => ({ ...prev, ...patch }));
      setLocateNote(
        filled.length
          ? `Filled in ${filled.join(", ")} — straight-line distances, check them over.`
          : "Those three are already filled in — clear one to look it up again.",
      );
    } catch (e) {
      // Surface the real reason instead of a hardcoded "unavailable" string
      // that hides whatever actually failed (bad request, backend error,
      // network failure) behind identical-looking text every time.
      setLocateNote(`Distance lookup failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLocating(false);
    }
  }

  /** Switching the transport type is a deliberate, specific request — "show
   * me the nearest bus stop instead" — so unlike lookUpDistances above, this
   * always overwrites publicTransportNote with the new mode's answer, even
   * if a value (from a capture, or the general lookup) is already there.
   * The other two fields are untouched. */
  async function runTransportModeLookup(mode: TransportMode) {
    setTransportMode(mode);
    if (!form.address.trim() && !form.city.trim()) return;
    setLocating(true);
    setLocateNote(null);
    try {
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
      const d = (await res.json()) as { public_transport: string | null };
      if (d.public_transport) {
        setForm((prev) => ({ ...prev, publicTransportNote: d.public_transport as string }));
        setLocateNote(`Filled in the nearest ${TRANSPORT_MODE_LABELS[mode].toLowerCase()} stop — check it over.`);
      } else {
        setLocateNote(`Couldn't find a nearby ${TRANSPORT_MODE_LABELS[mode].toLowerCase()} stop for that address.`);
      }
    } catch (e) {
      setLocateNote(`Distance lookup failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLocating(false);
    }
  }

  // Auto-run once on mount rather than waiting for someone to remember the
  // button: a building arriving with an address but no distances yet — a
  // fresh capture, or an older one saved before this existed — shouldn't
  // need a click just to get straight-line estimates. Same blanks-only
  // behaviour as the button, so a figure the listing (or a person) already
  // stated is still never overwritten, and the same loading/error state
  // shows either way.
  const autoLookupRan = useRef(false);
  useEffect(() => {
    if (autoLookupRan.current) return;
    autoLookupRan.current = true;
    if (
      (form.address.trim() || form.city.trim()) &&
      (!form.publicTransportNote || !form.accessibilityNote || !form.airportNote)
    ) {
      // Deferred a tick: lookUpDistances's first line sets state
      // synchronously, and calling it directly in the effect body trips
      // react-hooks/set-state-in-effect (cascading-render risk) even though
      // this only ever runs once, guarded by the ref above.
      queueMicrotask(() => lookUpDistances());
    }
    // Deliberately mount-only — not on every address edit, so it can't fire
    // on every keystroke/blur while someone is still typing an address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.address || !form.city) {
      setError("Name, address, and city are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        address: form.address,
        postal_code: form.postalCode || null,
        city: form.city,
        neighbourhood_id: form.neighbourhoodId || null,
        submarket: form.submarket || null,
        building_type: form.buildingType || null,
        year_built: form.yearBuilt ? Number(form.yearBuilt) : null,
        energy_label: form.energyLabel || null,
        breeam_rating: form.breeamRating || null,
        total_building_area_m2: form.totalBuildingAreaM2 ? Number(form.totalBuildingAreaM2) : null,
        accessibility_note: form.accessibilityNote || null,
        airport_note: form.airportNote || null,
        public_transport_note: form.publicTransportNote || null,
        building_amenities: form.buildingAmenities,
        photos: form.photos
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };

      if (buildingId) {
        await api.updateBuilding(buildingId, payload);
        router.push(`/buildings/${buildingId}`);
        router.refresh();
        return;
      }

      const building = await api.createBuilding(payload);

      // Lease-terms section filled in → create the building's first Unit in
      // the same submit, so the executive summary is complete immediately.
      // Total building area is only a fallback for the rare listing that
      // states nothing else — the offered area is the figure that matters.
      const areaForUnit = form.availableAreaM2 || form.totalBuildingAreaM2;
      if (areaForUnit && hasLeaseTerms) {
        const unit = await api.createUnit({
          building_id: building.building_id,
          available_area_m2: Number(areaForUnit),
          min_divisible_area_m2: form.minDivisibleAreaM2 ? Number(form.minDivisibleAreaM2) : null,
          rent_price_type: form.rentEurPerM2Year ? "fixed" : "tbd",
          rent_eur_per_m2_year: form.rentEurPerM2Year ? Number(form.rentEurPerM2Year) : null,
          service_charge_price_type: form.serviceChargeEurPerM2Year ? "fixed" : "tbd",
          service_charge_eur_per_m2_year: form.serviceChargeEurPerM2Year
            ? Number(form.serviceChargeEurPerM2Year)
            : null,
          parking_ratio: form.parkingRatio || null,
          availability: form.availability || null,
        });
        if (form.parkingPriceEurYear) {
          await api.createAddOn({
            name: "Parking space",
            price: Number(form.parkingPriceEurYear),
            price_unit: "EUR / space / year",
            unit_id: unit.unit_id,
            building_id: building.building_id,
          });
        }
      }

      // Land back in the library with the new building already ticked,
      // instead of on its detail page — a fresh capture almost always means
      // "get this in front of a client," and the library is where that
      // happens. Editing is still one click away (the row's Edit link).
      router.push(`/buildings?select=${building.building_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create building");
    } finally {
      setSubmitting(false);
    }
  }

  // The executive-summary card doubles as this building's title block once a
  // name/address exist (a Chrome-extension capture, or an existing building
  // being edited) — a generic "Executive summary" label only where neither
  // is known yet (a hand-typed new building, nothing filled in below yet).
  const hasIdentity = Boolean(form.name.trim() || form.address.trim());
  const photoCount = form.photos.split(",").map((s) => s.trim()).filter(Boolean).length;
  const hasLeaseTerms = Boolean(
    form.rentEurPerM2Year || form.serviceChargeEurPerM2Year || form.parkingRatio || form.availability,
  );
  const draftMatch = duplicates.find((d) => d.is_draft);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <div className="mb-1 flex items-center gap-2">
          <h2 className="text-lg font-semibold">Photos</h2>
          {photoCount > 0 && <Badge tone="accent">{photoCount}</Badge>}
        </div>
        <p className="mb-4 text-sm text-muted">
          {photoCount} photo{photoCount === 1 ? "" : "s"} captured — duplicates from lazy-loading removed
          automatically.
        </p>
        <PhotoPicker value={form.photos} onChange={(next) => update("photos", next)} variant="gallery" />
      </Card>

      {!isEdit && (
      <Card>
        {hasIdentity ? (
          <>
            <h2 className="mb-0.5 text-[22px] font-bold tracking-tight">{form.name || form.address}</h2>
            {form.address && form.name && form.address !== form.name && (
              <p className="mb-4 text-sm text-muted">{form.address}</p>
            )}
          </>
        ) : (
          <h2 className="mb-1 text-lg font-semibold">Executive summary — lease terms</h2>
        )}
        <p className="mb-4 text-sm text-muted">
          Filled in by the Chrome extension where the listing states them. Saving creates the
          building&apos;s available space with these terms — leave empty to add spaces by hand later
          instead.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            <span className="mb-1.5 block">Available area approx. (m²)</span>
            <input type="number" value={form.availableAreaM2} onChange={(e) => update("availableAreaM2", e.target.value)} placeholder="Office space on offer" className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1.5 block">Smallest unit (m²)</span>
            <input type="number" value={form.minDivisibleAreaM2} onChange={(e) => update("minDivisibleAreaM2", e.target.value)} placeholder="e.g. 280 — part-floor leasing" className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1.5 block">Parking ratio</span>
            <input value={form.parkingRatio} onChange={(e) => update("parkingRatio", e.target.value)} placeholder="1:80" className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1.5 block">Rental price office (€/m²/year)</span>
            <input type="number" value={form.rentEurPerM2Year} onChange={(e) => update("rentEurPerM2Year", e.target.value)} placeholder="165" className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1.5 block">Service charges (€/m²/year)</span>
            <input type="number" value={form.serviceChargeEurPerM2Year} onChange={(e) => update("serviceChargeEurPerM2Year", e.target.value)} placeholder="45" className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1.5 block">Rental price parking space (€/space/year)</span>
            <input type="number" value={form.parkingPriceEurYear} onChange={(e) => update("parkingPriceEurYear", e.target.value)} placeholder="750" className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1.5 block">Available</span>
            <input value={form.availability} onChange={(e) => update("availability", e.target.value)} placeholder="Per direct / in overleg" className={inputClass} />
          </label>
        </div>

        <div className="mt-6 border-t border-border pt-5">
          <div className="mb-3.5 flex items-baseline justify-between gap-4">
            <span className="text-xs font-bold uppercase tracking-wide text-muted">Amenities</span>
            <span className="text-xs text-muted">Shown on the client brochure as tagged</span>
          </div>
          <AmenityMultiSelect
            value={form.buildingAmenities}
            onChange={(next) => update("buildingAmenities", next)}
          />
        </div>
      </Card>
      )}

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Building</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            <span className="mb-1.5 block">
              Name <span className="text-accent">*</span>
            </span>
            <input value={form.name} onChange={(e) => update("name", e.target.value)} className={inputClass} required />
          </label>
          <label className={labelClass}>
            <span className="mb-1.5 block">Building type</span>
            <input value={form.buildingType} onChange={(e) => update("buildingType", e.target.value)} placeholder="Turn-key Office" className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1.5 block">
              Address <span className="text-accent">*</span>
            </span>
            <input value={form.address} onChange={(e) => update("address", e.target.value)} className={inputClass} required />
          </label>
          <label className={labelClass}>
            <span className="mb-1.5 block">Postal code</span>
            <input value={form.postalCode} onChange={(e) => update("postalCode", e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1.5 block">
              City <span className="text-accent">*</span>
            </span>
            <input value={form.city} onChange={(e) => update("city", e.target.value)} className={inputClass} required />
          </label>
          <label className={labelClass}>
            <span className="mb-1.5 block">Neighbourhood</span>
            <select value={form.neighbourhoodId} onChange={(e) => update("neighbourhoodId", e.target.value)} className={inputClass}>
              <option value="">None</option>
              {neighbourhoods.map((n) => (
                <option key={n.neighbourhood_id} value={n.neighbourhood_id}>
                  {n.name}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            <span className="mb-1.5 block">Submarket</span>
            <input value={form.submarket} onChange={(e) => update("submarket", e.target.value)} placeholder="Used to group regions in exports" className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1.5 block">Year built</span>
            <input type="number" value={form.yearBuilt} onChange={(e) => update("yearBuilt", e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1.5 block">Energy label</span>
            <input value={form.energyLabel} onChange={(e) => update("energyLabel", e.target.value)} placeholder="A" className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1.5 block">BREEAM rating</span>
            <input value={form.breeamRating} onChange={(e) => update("breeamRating", e.target.value)} placeholder="Excellent" className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1.5 block">Total building area (m²)</span>
            <input type="number" value={form.totalBuildingAreaM2} onChange={(e) => update("totalBuildingAreaM2", e.target.value)} className={inputClass} />
          </label>
        </div>

        {duplicates.length > 0 && !duplicatesDismissed && (
          <div className="mt-4 rounded-xl bg-warn-bg p-4 text-sm text-warn-foreground">
            {draftMatch && hasLeaseTerms ? (
              <p className="font-semibold">
                There&apos;s an incomplete draft of this building — consider completing that one instead of
                creating a new entry.
              </p>
            ) : (
              <p className="font-semibold">
                This looks similar to {duplicates.length} building{duplicates.length === 1 ? "" : "s"} already
                in the library:
              </p>
            )}
            <ul className="mt-2 space-y-2">
              {duplicates.map((d) => (
                <li key={d.building_id} className="flex items-center justify-between gap-3 rounded-lg bg-white/40 px-3 py-2">
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    {d.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- arbitrary captured URLs, no fixed domain to allowlist
                      <img src={d.thumbnail_url} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
                    ) : (
                      <div className="h-9 w-9 shrink-0 rounded-md bg-warn-foreground/15" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-medium">{d.name || d.address}</div>
                      <div className="truncate text-xs opacity-80">
                        {d.address}
                        {d.is_draft
                          ? " — draft, no spaces yet"
                          : ` — ${d.space_count} space${d.space_count === 1 ? "" : "s"}`}
                      </div>
                    </div>
                  </div>
                  <Link
                    href={`/buildings/${d.building_id}`}
                    className="shrink-0 whitespace-nowrap text-xs font-semibold underline hover:no-underline"
                  >
                    View / Edit instead →
                  </Link>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setDuplicatesDismissed(true)}
              className="mt-2.5 text-xs font-semibold underline hover:no-underline"
            >
              Not a duplicate — this is a different building
            </button>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-semibold">Accessibility</h2>
        <p className="mb-4 text-sm text-muted">Auto-filled once the address is confirmed — edit any field to override.</p>

        <div className="mb-4">
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-accent">Highway access</div>
          <input
            value={form.accessibilityNote}
            onChange={(e) => update("accessibilityNote", e.target.value)}
            placeholder="e.g. 3 km"
            className={inputClass}
          />
        </div>
        <div className="mb-4">
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-accent">Airport access</div>
          <input
            value={form.airportNote}
            onChange={(e) => update("airportNote", e.target.value)}
            placeholder="e.g. 15 km"
            className={inputClass}
          />
        </div>
        <div className="mb-1">
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-accent">Public transport</div>
          <div className="flex gap-2">
            <input
              value={form.publicTransportNote}
              onChange={(e) => update("publicTransportNote", e.target.value)}
              placeholder="e.g. 0.8 km"
              className={inputClass}
            />
            <select
              value={transportMode}
              onChange={(e) => runTransportModeLookup(e.target.value as TransportMode)}
              disabled={locating}
              title="Look up a specific type of stop instead — replaces the note above"
              className={selectClass}
            >
              {(Object.entries(TRANSPORT_MODE_LABELS) as [TransportMode, string][]).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" variant="ghost" disabled={locating} onClick={lookUpDistances}>
            {locating ? "Looking up…" : "Look up distances"}
          </Button>
          {locateNote && <span className="text-xs text-accent">{locateNote}</span>}
        </div>
      </Card>

      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : isEdit ? "Save changes" : "Save to library"}
        </Button>
        <Button type="button" variant="ghost" disabled={submitting} onClick={() => router.push("/buildings")}>
          Discard
        </Button>
      </div>
      <p className="text-xs text-muted">
        {isEdit
          ? "Saves the building's own details. Its available spaces and add-ons are edited separately, below."
          : "Saved permanently in your library — reusable for any client, and never overwritten by a later capture."}
      </p>
    </form>
  );
}
