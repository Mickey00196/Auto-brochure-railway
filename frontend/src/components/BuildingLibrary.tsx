"use client";

import Link from "next/link";
import { useState } from "react";
import type { Building } from "@/lib/types";
import { PROXY_BASE_URL } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";
import { formatArea } from "@/lib/format";

/** Step 3 + 4 in one screen: tick buildings, name the client, get the PDF.
 * Selection order is preserved — it's the order they appear in the document. */
export function BuildingLibrary({ buildings }: { buildings: Building[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [clientName, setClientName] = useState("");
  const [preparedBy, setPreparedBy] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const visible = buildings.filter((b) => {
    if (!query.trim()) return true;
    const haystack = `${b.name} ${b.address} ${b.city} ${b.submarket ?? ""}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  async function generate() {
    if (!clientName.trim() || selected.length === 0) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`${PROXY_BASE_URL}/library/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: clientName.trim(),
          building_ids: selected,
          prepared_by: preparedBy.trim() || null,
        }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) {
        const body = await res.text();
        let detail = body;
        try {
          detail = JSON.parse(body).detail ?? body;
        } catch {
          /* not JSON */
        }
        throw new Error(typeof detail === "string" ? detail : "Could not generate the PDF");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `availability-${clientName.trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate the PDF");
    } finally {
      setGenerating(false);
    }
  }

  if (buildings.length === 0) {
    return (
      <Card>
        <h2 className="text-lg font-semibold">Your library is empty</h2>
        <p className="mt-1 text-sm text-muted">
          Capture your first building: open a listing and click the Chrome extension, or paste the link.
        </p>
        <div className="mt-4 flex gap-2">
          <Link href="/buildings/new">
            <Button>Add a building</Button>
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="pb-40">
      <div className="mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by address, city or area…"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm sm:max-w-sm"
        />
      </div>

      <div className="space-y-3">
        {visible.map((building) => {
          const isSelected = selected.includes(building.building_id);
          const totalAvailable = building.units.reduce((sum, u) => sum + (u.available_area_m2 ?? 0), 0);
          const rents = building.units
            .map((u) => u.rent_eur_per_m2_year)
            .filter((r): r is number => typeof r === "number");
          const rentLabel = rents.length
            ? rents.length === 1 || Math.min(...rents) === Math.max(...rents)
              ? `€${Math.min(...rents).toLocaleString("en-US")}/m²/yr`
              : `€${Math.min(...rents).toLocaleString("en-US")}–€${Math.max(...rents).toLocaleString("en-US")}/m²/yr`
            : "Rent TBD";

          return (
            <Card
              key={building.building_id}
              className={`transition ${isSelected ? "border-accent ring-1 ring-accent" : ""}`}
            >
              <div className="flex items-start gap-4">
                {/* Selecting and opening are different intents, so they get
                    different targets: this padded hit area ticks the box,
                    the row itself opens the building for editing. */}
                <label
                  className="-m-2 shrink-0 cursor-pointer p-2"
                  aria-label={`Select ${building.address}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(building.building_id)}
                    className="mt-1 h-5 w-5 cursor-pointer accent-accent"
                  />
                </label>
                <Link href={`/buildings/${building.building_id}`} className="shrink-0">
                  {building.photos.length > 0 ? (
                    // eslint-disable-next-line @next/next/no-img-element -- arbitrary captured URLs, no fixed domain to allowlist
                    <img
                      src={building.photos[0]}
                      alt=""
                      className="h-16 w-16 rounded-lg border border-border object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-border text-[10px] text-muted">
                      No photo
                    </div>
                  )}
                </Link>

                <Link href={`/buildings/${building.building_id}`} className="group flex-1">
                  <p className="font-semibold group-hover:text-accent group-hover:underline">{building.address}</p>
                  <p className="text-sm text-muted">
                    {[building.submarket, building.city].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-1 text-sm">
                    <span className="font-medium">
                      {totalAvailable > 0 ? formatArea(totalAvailable) : "Area TBD"}
                    </span>
                    <span className="text-muted"> · {rentLabel}</span>
                    {building.energy_label && <span className="text-muted"> · Energy {building.energy_label}</span>}
                  </p>
                </Link>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Badge>{building.units.length} space{building.units.length === 1 ? "" : "s"}</Badge>
                  <Link
                    href={`/buildings/${building.building_id}`}
                    className="text-xs font-semibold text-accent hover:underline"
                  >
                    Edit →
                  </Link>
                </div>
              </div>
            </Card>
          );
        })}
        {visible.length === 0 && (
          <Card>
            <p className="text-sm text-muted">No buildings match “{query}”.</p>
          </Card>
        )}
      </div>

      {/* Step 4 — always reachable, so the path from selection to PDF is one click */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end gap-3 px-6 py-4">
          <div className="text-sm">
            <span className="font-semibold">{selected.length}</span>
            <span className="text-muted"> selected</span>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => setSelected([])}
                className="ml-2 text-xs text-muted underline hover:text-foreground"
              >
                clear
              </button>
            )}
          </div>
          <label className="text-xs">
            <span className="mb-1 block font-medium text-muted">Client</span>
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Client name"
              className="w-44 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block font-medium text-muted">Prepared by (optional)</span>
            <input
              value={preparedBy}
              onChange={(e) => setPreparedBy(e.target.value)}
              placeholder="Your name"
              className="w-44 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <Button
            onClick={generate}
            disabled={generating || selected.length === 0 || !clientName.trim()}
          >
            {generating ? "Generating…" : "Generate PDF"}
          </Button>
          {error && <p className="w-full text-xs text-red-500">{error}</p>}
          {!error && selected.length > 0 && !clientName.trim() && (
            <p className="w-full text-xs text-muted">Add a client name to generate the PDF.</p>
          )}
        </div>
      </div>
    </div>
  );
}
