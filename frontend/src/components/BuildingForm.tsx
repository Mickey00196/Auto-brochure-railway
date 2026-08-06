"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Neighbourhood, ScrapePreviewResult } from "@/lib/types";
import { api } from "@/lib/api";
import { Button, Card } from "@/components/ui";

const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const labelClass = "text-sm";

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
  buildingAmenities: "",
  description: "",
  photos: "",
  // Executive summary — lease terms. These live on the building's first
  // Unit (and a parking AddOn), created together with the Building on
  // submit so a captured listing lands complete, not as a shell.
  availableAreaM2: "",
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

  const [sourceUrl, setSourceUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchMessage, setFetchMessage] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  const [pasteContent, setPasteContent] = useState("");
  const [pasting, setPasting] = useState(false);
  const [pasteMessage, setPasteMessage] = useState<string | null>(null);

  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial });

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Fill the form from a scrape/paste result — only fields it actually found,
  // so an empty result never blanks out what the broker already typed.
  function applyScraped(scraped: ScrapePreviewResult): boolean {
    setForm((prev) => ({
      ...prev,
      name: scraped.name || prev.name,
      address: scraped.address || prev.address,
      city: scraped.city || prev.city,
      description: scraped.description || prev.description,
      energyLabel: scraped.energy_label || prev.energyLabel,
      yearBuilt: scraped.year_built ? String(scraped.year_built) : prev.yearBuilt,
      buildingAmenities: scraped.building_amenities.length ? scraped.building_amenities.join(", ") : prev.buildingAmenities,
      photos: scraped.photos.length ? scraped.photos.join(", ") : prev.photos,
    }));
    return Boolean(scraped.address || scraped.photos.length || scraped.energy_label);
  }

  async function handleFetchFromUrl() {
    if (!sourceUrl.trim()) return;
    setFetching(true);
    setFetchError(null);
    setFetchMessage(null);
    setBlocked(false);
    try {
      const scraped = await api.scrapePreview(sourceUrl.trim());
      const foundSomething = applyScraped(scraped);
      setFetchMessage(
        foundSomething
          ? "Ingevuld met wat op de pagina stond — controleer het en vul aan waar nodig."
          : "Pagina opgehaald, maar er stond weinig bruikbaars op — vul de rest handmatig in.",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Kon die URL niet ophalen";
      // Step 4: recognise a block explicitly and point the user at the
      // compliant manual-paste fallback rather than showing a vague error.
      const isBlock = /502|blocked|access|denied|interstitial|geblokkeerd/i.test(msg);
      setBlocked(isBlock);
      setFetchError(
        isBlock
          ? "Deze website blokkeert automatische toegang. Open de listing zelf in je browser, kopieer de tekst van de pagina, en plak die hieronder."
          : msg,
      );
    } finally {
      setFetching(false);
    }
  }

  async function handleParseText() {
    if (!pasteContent.trim()) return;
    setPasting(true);
    setPasteMessage(null);
    try {
      const parsed = await api.parseText(pasteContent);
      const foundSomething = applyScraped(parsed);
      setPasteMessage(
        foundSomething
          ? "Velden ingevuld uit de geplakte tekst — controleer en vul aan, en sla daarna op."
          : "Verwerkt, maar weinig herkend — vul de velden handmatig aan.",
      );
    } catch (err) {
      setPasteMessage(err instanceof Error ? err.message : "Kon de geplakte tekst niet verwerken");
    } finally {
      setPasting(false);
    }
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
        building_amenities: form.buildingAmenities
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        description: form.description || null,
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
      // The available area falls back to the total building area, since
      // single-tenant listings state one figure for both.
      const areaForUnit = form.availableAreaM2 || form.totalBuildingAreaM2;
      const hasLeaseTerms = Boolean(
        form.rentEurPerM2Year || form.serviceChargeEurPerM2Year || form.parkingRatio || form.availability,
      );
      if (areaForUnit && hasLeaseTerms) {
        const unit = await api.createUnit({
          building_id: building.building_id,
          available_area_m2: Number(areaForUnit),
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

      router.push(`/buildings/${building.building_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create building");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {!isEdit && (
      <>
      <Card>
        <h2 className="mb-4 text-lg font-semibold">Fetch from a listing URL</h2>
        <p className="mb-3 text-sm text-muted">
          Paste a link to the listing and pull in what the page has — address, description, energy label,
          photos, amenities — then fill in whatever it missed by hand.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://..."
            className={`${inputClass} flex-1`}
          />
          <Button type="button" disabled={fetching || !sourceUrl.trim()} onClick={handleFetchFromUrl}>
            {fetching ? "Fetching…" : "Fetch from URL"}
          </Button>
        </div>
        {fetchError && <p className={`mt-2 text-xs ${blocked ? "text-amber-600" : "text-red-500"}`}>{fetchError}</p>}
        {fetchMessage && !fetchError && <p className="mt-2 text-xs text-muted">{fetchMessage}</p>}
      </Card>

      <Card className={blocked ? "border-amber-400" : undefined}>
        <h2 className="mb-1 text-lg font-semibold">Of: plak de listing-tekst handmatig</h2>
        <p className="mb-3 text-sm text-muted">
          Blokkeert de website automatische toegang (zoals Funda)? Open de listing zelf in je browser,
          selecteer en kopieer de tekst van de pagina (of de HTML-broncode), en plak die hier. Dezelfde
          velden — adres, oppervlakte, huurprijs, energielabel — worden er dan uit gehaald. Er wordt niets
          automatisch opgehaald, dus een bot-blokkade speelt hier geen rol.
        </p>
        <textarea
          value={pasteContent}
          onChange={(e) => setPasteContent(e.target.value)}
          rows={5}
          placeholder="Plak hier de tekst of HTML van de listing-pagina…"
          className={inputClass}
        />
        <div className="mt-2">
          <Button type="button" disabled={pasting || !pasteContent.trim()} onClick={handleParseText}>
            {pasting ? "Verwerken…" : "Velden uit tekst halen"}
          </Button>
        </div>
        {pasteMessage && <p className="mt-2 text-xs text-muted">{pasteMessage}</p>}
      </Card>
      </>
      )}

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Building</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Name *</span>
            <input value={form.name} onChange={(e) => update("name", e.target.value)} className={inputClass} required />
          </label>
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Building type</span>
            <input value={form.buildingType} onChange={(e) => update("buildingType", e.target.value)} placeholder="Turn-key Office" className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Address *</span>
            <input value={form.address} onChange={(e) => update("address", e.target.value)} className={inputClass} required />
          </label>
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Postal code</span>
            <input value={form.postalCode} onChange={(e) => update("postalCode", e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1 block font-medium">City *</span>
            <input value={form.city} onChange={(e) => update("city", e.target.value)} className={inputClass} required />
          </label>
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Neighbourhood</span>
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
            <span className="mb-1 block font-medium">Submarket</span>
            <input value={form.submarket} onChange={(e) => update("submarket", e.target.value)} placeholder="Used to group regions in exports" className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Year built</span>
            <input type="number" value={form.yearBuilt} onChange={(e) => update("yearBuilt", e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Energy label</span>
            <input value={form.energyLabel} onChange={(e) => update("energyLabel", e.target.value)} placeholder="A" className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1 block font-medium">BREEAM rating</span>
            <input value={form.breeamRating} onChange={(e) => update("breeamRating", e.target.value)} placeholder="Excellent" className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Total building area (m²)</span>
            <input type="number" value={form.totalBuildingAreaM2} onChange={(e) => update("totalBuildingAreaM2", e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Accessibility note</span>
            <input value={form.accessibilityNote} onChange={(e) => update("accessibilityNote", e.target.value)} placeholder="A10 3 km" className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Airport note</span>
            <input value={form.airportNote} onChange={(e) => update("airportNote", e.target.value)} placeholder="Schiphol 15 km" className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Public transport note</span>
            <input value={form.publicTransportNote} onChange={(e) => update("publicTransportNote", e.target.value)} placeholder="Station Noord 8 min" className={inputClass} />
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            <span className="mb-1 block font-medium">Amenities (comma-separated)</span>
            <input value={form.buildingAmenities} onChange={(e) => update("buildingAmenities", e.target.value)} placeholder="Roof terrace, Bicycle storage, 24/7 access" className={inputClass} />
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            <span className="mb-1 block font-medium">Photo URLs (comma-separated)</span>
            <input value={form.photos} onChange={(e) => update("photos", e.target.value)} className={inputClass} />
            {form.photos.trim() && (
              <div className="mt-2 flex flex-wrap gap-2">
                {form.photos
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((src) => (
                    // eslint-disable-next-line @next/next/no-img-element -- arbitrary scraped URLs, no fixed domain list to allowlist for next/image
                    <img key={src} src={src} alt="" className="h-16 w-16 rounded-md border border-border object-cover" />
                  ))}
              </div>
            )}
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            <span className="mb-1 block font-medium">Description</span>
            <textarea value={form.description} onChange={(e) => update("description", e.target.value)} rows={3} className={inputClass} />
          </label>
        </div>
      </Card>

      {!isEdit && (
      <Card>
        <h2 className="mb-1 text-lg font-semibold">Executive summary — lease terms</h2>
        <p className="mb-4 text-sm text-muted">
          Filled in by the extension capture where the listing states them. Saving creates the
          building&apos;s first unit with these terms (plus a parking add-on if a parking price is set) —
          leave them empty to add units by hand later instead.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Available area approx. (m²)</span>
            <input type="number" value={form.availableAreaM2} onChange={(e) => update("availableAreaM2", e.target.value)} placeholder="Falls back to total area" className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Parking ratio</span>
            <input value={form.parkingRatio} onChange={(e) => update("parkingRatio", e.target.value)} placeholder="1:80" className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Rental price office (€/m²/year)</span>
            <input type="number" value={form.rentEurPerM2Year} onChange={(e) => update("rentEurPerM2Year", e.target.value)} placeholder="165" className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Service charges (€/m²/year)</span>
            <input type="number" value={form.serviceChargeEurPerM2Year} onChange={(e) => update("serviceChargeEurPerM2Year", e.target.value)} placeholder="45" className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Rental price parking space (€/space/year)</span>
            <input type="number" value={form.parkingPriceEurYear} onChange={(e) => update("parkingPriceEurYear", e.target.value)} placeholder="750" className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Available</span>
            <input value={form.availability} onChange={(e) => update("availability", e.target.value)} placeholder="Per direct / in overleg" className={inputClass} />
          </label>
        </div>
      </Card>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button type="submit" disabled={submitting}>
        {submitting ? "Saving…" : isEdit ? "Save changes" : "Save to library"}
      </Button>
      <p className="text-xs text-muted">
        {isEdit
          ? "Available spaces and add-ons are managed on the building's own page."
          : "Saved permanently in your library — reusable for any client, and never overwritten by a later capture."}
      </p>
    </form>
  );
}
