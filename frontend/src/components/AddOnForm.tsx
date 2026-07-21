"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Unit } from "@/lib/types";
import { api } from "@/lib/api";
import { Button } from "@/components/ui";

const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

export function AddOnForm({ buildingId, units }: { buildingId: string; units: Unit[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("Parking space");
  const [price, setPrice] = useState("");
  const [priceUnit, setPriceUnit] = useState("EUR / space / year");
  const [quantity, setQuantity] = useState("");
  const [unitId, setUnitId] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!price) {
      setError("Price is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createAddOn({
        building_id: unitId ? null : buildingId,
        unit_id: unitId || null,
        name,
        price: Number(price),
        price_unit: priceUnit,
        quantity_available: quantity ? Number(quantity) : null,
      });
      setOpen(false);
      setPrice("");
      setQuantity("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        + Add parking / package
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-border p-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="mb-1 block font-medium">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </label>
        <label>
          <span className="mb-1 block font-medium">Applies to</span>
          <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className={inputClass}>
            <option value="">Whole building</option>
            {units.map((u) => (
              <option key={u.unit_id} value={u.unit_id}>
                {u.floor ?? "Unit"} ({u.available_area_m2} m²)
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block font-medium">Price</span>
          <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} required />
        </label>
        <label>
          <span className="mb-1 block font-medium">Price unit</span>
          <input value={priceUnit} onChange={(e) => setPriceUnit(e.target.value)} className={inputClass} />
        </label>
        <label>
          <span className="mb-1 block font-medium">Quantity available</span>
          <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} />
        </label>
      </div>
      {error && <p className="text-red-500">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Adding…" : "Add"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
