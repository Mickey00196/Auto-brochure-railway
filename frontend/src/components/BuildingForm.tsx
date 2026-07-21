"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Neighbourhood } from "@/lib/types";
import { api } from "@/lib/api";
import { Button, Card } from "@/components/ui";

const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const labelClass = "text-sm";

export function BuildingForm({ neighbourhoods }: { neighbourhoods: Neighbourhood[] }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
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
    buildingAmenities: "",
    description: "",
    photos: "",
  });

  function update<K extends keyof typeof form>(key: K, value: string) {
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
      const building = await api.createBuilding({
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
        building_amenities: form.buildingAmenities
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        description: form.description || null,
        photos: form.photos
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      router.push(`/buildings/${building.building_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create building");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
          <label className={`${labelClass} sm:col-span-2`}>
            <span className="mb-1 block font-medium">Amenities (comma-separated)</span>
            <input value={form.buildingAmenities} onChange={(e) => update("buildingAmenities", e.target.value)} placeholder="Roof terrace, Bicycle storage, 24/7 access" className={inputClass} />
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            <span className="mb-1 block font-medium">Photo URLs (comma-separated)</span>
            <input value={form.photos} onChange={(e) => update("photos", e.target.value)} className={inputClass} />
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            <span className="mb-1 block font-medium">Description</span>
            <textarea value={form.description} onChange={(e) => update("description", e.target.value)} rows={3} className={inputClass} />
          </label>
        </div>
      </Card>

      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button type="submit" disabled={submitting}>
        {submitting ? "Creating…" : "Create Building"}
      </Button>
      <p className="text-xs text-muted">You&apos;ll be able to add units on the next screen.</p>
    </form>
  );
}
