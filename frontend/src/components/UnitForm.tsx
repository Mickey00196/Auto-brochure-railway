"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { Button, Card } from "@/components/ui";

const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const labelClass = "text-sm";

export function UnitForm({ buildingId }: { buildingId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pricingModel, setPricingModel] = useState<"per_sqm_annual" | "per_desk_monthly">("per_sqm_annual");
  const [form, setForm] = useState({
    floor: "",
    availableAreaM2: "",
    minDivisibleAreaM2: "",
    deliveryCondition: "shell_and_core",
    rentPriceType: "fixed",
    rentEurPerM2Year: "",
    serviceChargePriceType: "fixed",
    serviceChargeEurPerM2Year: "",
    deskCount: "",
    pricePerDeskMonthEur: "",
    spaceProvider: "",
    meetingRoomNote: "",
    parkingRatio: "",
    contractTerm: "",
    contractTermYears: "",
    availability: "",
    unitAmenities: "",
    photos: "",
  });

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.availableAreaM2) {
      setError("Available area is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createUnit({
        building_id: buildingId,
        floor: form.floor || null,
        available_area_m2: Number(form.availableAreaM2),
        min_divisible_area_m2: form.minDivisibleAreaM2 ? Number(form.minDivisibleAreaM2) : null,
        delivery_condition: form.deliveryCondition,
        pricing_model: pricingModel,
        rent_price_type: pricingModel === "per_sqm_annual" ? form.rentPriceType : "tbd",
        rent_eur_per_m2_year:
          pricingModel === "per_sqm_annual" && form.rentEurPerM2Year ? Number(form.rentEurPerM2Year) : null,
        service_charge_price_type: pricingModel === "per_sqm_annual" ? form.serviceChargePriceType : "tbd",
        service_charge_eur_per_m2_year:
          pricingModel === "per_sqm_annual" && form.serviceChargeEurPerM2Year
            ? Number(form.serviceChargeEurPerM2Year)
            : null,
        desk_count: pricingModel === "per_desk_monthly" && form.deskCount ? Number(form.deskCount) : null,
        price_per_desk_month_eur:
          pricingModel === "per_desk_monthly" && form.pricePerDeskMonthEur ? Number(form.pricePerDeskMonthEur) : null,
        space_provider: form.spaceProvider || null,
        meeting_room_note: form.meetingRoomNote || null,
        parking_ratio: form.parkingRatio || null,
        contract_term: form.contractTerm || null,
        contract_term_years: form.contractTermYears ? Number(form.contractTermYears) : null,
        availability: form.availability || null,
        unit_amenities: form.unitAmenities.split(",").map((s) => s.trim()).filter(Boolean),
        photos: form.photos.split(",").map((s) => s.trim()).filter(Boolean),
      });
      router.push(`/buildings/${buildingId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create unit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <h2 className="mb-4 text-lg font-semibold">Unit</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Floor</span>
            <input value={form.floor} onChange={(e) => update("floor", e.target.value)} placeholder="2nd floor" className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Delivery condition</span>
            <select value={form.deliveryCondition} onChange={(e) => update("deliveryCondition", e.target.value)} className={inputClass}>
              <option value="turn_key">Turn key</option>
              <option value="shell_and_core">Shell and core</option>
              <option value="shell_and_core_plus">Shell and core plus</option>
              <option value="mixed">Mixed</option>
            </select>
          </label>
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Available area (m²) *</span>
            <input type="number" value={form.availableAreaM2} onChange={(e) => update("availableAreaM2", e.target.value)} className={inputClass} required />
          </label>
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Min divisible area (m²)</span>
            <input type="number" value={form.minDivisibleAreaM2} onChange={(e) => update("minDivisibleAreaM2", e.target.value)} placeholder="e.g. units from 75 m²" className={inputClass} />
          </label>
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-semibold">Pricing</h2>
        <p className="mb-4 text-sm text-muted">Direct-lease (per m²/year) or flex/serviced-office (per desk/month) — never both.</p>
        <div className="mb-4 flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={pricingModel === "per_sqm_annual"} onChange={() => setPricingModel("per_sqm_annual")} />
            Direct lease (€/m²/yr)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={pricingModel === "per_desk_monthly"} onChange={() => setPricingModel("per_desk_monthly")} />
            Flex / per desk (€/desk/mo)
          </label>
        </div>

        {pricingModel === "per_sqm_annual" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              <span className="mb-1 block font-medium">Rent price type</span>
              <select value={form.rentPriceType} onChange={(e) => update("rentPriceType", e.target.value)} className={inputClass}>
                <option value="fixed">Fixed</option>
                <option value="from">From (starting price)</option>
                <option value="on_request">On request</option>
                <option value="tbd">TBD</option>
              </select>
            </label>
            <label className={labelClass}>
              <span className="mb-1 block font-medium">Rent (€/m²/yr)</span>
              <input type="number" value={form.rentEurPerM2Year} onChange={(e) => update("rentEurPerM2Year", e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              <span className="mb-1 block font-medium">Service charge price type</span>
              <select value={form.serviceChargePriceType} onChange={(e) => update("serviceChargePriceType", e.target.value)} className={inputClass}>
                <option value="fixed">Fixed</option>
                <option value="tbd">TBD</option>
              </select>
            </label>
            <label className={labelClass}>
              <span className="mb-1 block font-medium">Service charge (€/m²/yr)</span>
              <input type="number" value={form.serviceChargeEurPerM2Year} onChange={(e) => update("serviceChargeEurPerM2Year", e.target.value)} className={inputClass} />
            </label>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              <span className="mb-1 block font-medium">Desk count</span>
              <input type="number" value={form.deskCount} onChange={(e) => update("deskCount", e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              <span className="mb-1 block font-medium">Price per desk / month (€)</span>
              <input type="number" value={form.pricePerDeskMonthEur} onChange={(e) => update("pricePerDeskMonthEur", e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              <span className="mb-1 block font-medium">Space provider / brand</span>
              <input value={form.spaceProvider} onChange={(e) => update("spaceProvider", e.target.value)} placeholder="Flexspace Central" className={inputClass} />
            </label>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Terms & extras</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Contract term</span>
            <input value={form.contractTerm} onChange={(e) => update("contractTerm", e.target.value)} placeholder="5 years" className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Contract term (years, numeric)</span>
            <input type="number" value={form.contractTermYears} onChange={(e) => update("contractTermYears", e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Availability</span>
            <input value={form.availability} onChange={(e) => update("availability", e.target.value)} placeholder="Available per direct" className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Meeting room note</span>
            <input value={form.meetingRoomNote} onChange={(e) => update("meetingRoomNote", e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Parking ratio</span>
            <input value={form.parkingRatio} onChange={(e) => update("parkingRatio", e.target.value)} placeholder="1:100" className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Amenities (comma-separated)</span>
            <input value={form.unitAmenities} onChange={(e) => update("unitAmenities", e.target.value)} placeholder="LED lighting, Air conditioning" className={inputClass} />
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            <span className="mb-1 block font-medium">Photo URLs (comma-separated)</span>
            <input value={form.photos} onChange={(e) => update("photos", e.target.value)} className={inputClass} />
          </label>
        </div>
      </Card>

      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button type="submit" disabled={submitting}>
        {submitting ? "Creating…" : "Create Unit"}
      </Button>
    </form>
  );
}
