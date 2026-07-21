"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Building, Client } from "@/lib/types";
import { api } from "@/lib/api";
import { Button, Card } from "@/components/ui";
import { formatArea, formatUnitHeadlinePrice } from "@/lib/format";

export function ProposalForm({ clients, buildings }: { clients: Client[]; buildings: Building[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("Office Shortlist · Amsterdam 2026");
  const [preparedBy, setPreparedBy] = useState("");
  const [clientId, setClientId] = useState(clients[0]?.client_id ?? "");
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleUnit(unitId: string) {
    setSelectedUnitIds((prev) => (prev.includes(unitId) ? prev.filter((id) => id !== unitId) : [...prev, unitId]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId || selectedUnitIds.length === 0) {
      setError("Choose a client and at least one unit.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const proposal = await api.createProposal({
        client_id: clientId,
        title,
        prepared_by: preparedBy || undefined,
        unit_ids: selectedUnitIds,
      });
      router.push(`/proposals/${proposal.proposal_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create proposal");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              required
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Client</span>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              required
            >
              {clients.map((c) => (
                <option key={c.client_id} value={c.client_id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Prepared by</span>
            <input
              value={preparedBy}
              onChange={(e) => setPreparedBy(e.target.value)}
              placeholder="Your name or firm"
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
        </div>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Select units ({selectedUnitIds.length} selected)</h2>
        <div className="space-y-4">
          {buildings.map((building) => (
            <Card key={building.building_id}>
              <h3 className="font-semibold">{building.name}</h3>
              <p className="mb-3 text-sm text-muted">{building.address}</p>
              <div className="space-y-2">
                {building.units.map((unit) => (
                  <label
                    key={unit.unit_id}
                    className="flex cursor-pointer items-center justify-between rounded-lg border border-border p-3 text-sm hover:border-accent/50"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedUnitIds.includes(unit.unit_id)}
                        onChange={() => toggleUnit(unit.unit_id)}
                      />
                      <span>
                        {unit.floor ?? "Unit"} · {formatArea(unit.available_area_m2)}
                      </span>
                    </div>
                    <span className="text-muted">{formatUnitHeadlinePrice(unit)}</span>
                  </label>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button type="submit" disabled={submitting}>
        {submitting ? "Creating…" : "Create Proposal"}
      </Button>
    </form>
  );
}
