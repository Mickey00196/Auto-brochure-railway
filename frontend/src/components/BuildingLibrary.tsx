"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Building } from "@/lib/types";
import { PROXY_BASE_URL } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";
import { formatArea } from "@/lib/format";

// A ticked selection used to be plain component state, so navigating away
// mid-shortlist — to capture one more listing, say — silently threw it away.
// Persisting it here is what makes "capture five, then select and send" a
// single unbroken task instead of five separate ones.
const STORAGE_KEY = "office-shortlist:library-selection";

type StoredSelection = {
  selected: string[];
  clientName: string;
  preparedBy: string;
};

function readStoredSelection(): StoredSelection {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { selected: [], clientName: "", preparedBy: "" };
    const parsed = JSON.parse(raw);
    return {
      selected: Array.isArray(parsed.selected) ? parsed.selected.filter((x: unknown) => typeof x === "string") : [],
      clientName: typeof parsed.clientName === "string" ? parsed.clientName : "",
      preparedBy: typeof parsed.preparedBy === "string" ? parsed.preparedBy : "",
    };
  } catch {
    // Private-mode Safari throws on localStorage access; a fresh selection
    // is a fine fallback, not worth surfacing as an error.
    return { selected: [], clientName: "", preparedBy: "" };
  }
}

/** Step 3 + 4 in one screen: tick buildings, name the client, get the PDF.
 * Selection order is preserved — it's the order they appear in the document. */
function BuildingLibraryInner({ buildings }: { buildings: Building[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [selected, setSelected] = useState<string[]>([]);
  const [clientName, setClientName] = useState("");
  const [preparedBy, setPreparedBy] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const clientInputRef = useRef<HTMLInputElement>(null);

  // Restore the persisted selection on load, reconciled against buildings
  // that still exist (one may have been deleted since), and fold in a
  // ?select=<id> from a just-completed capture — this is how saving a new
  // building lands the broker back here with it already ticked instead of
  // on a dead-end detail page.
  useEffect(() => {
    const stored = readStoredSelection();
    const existingIds = new Set(buildings.map((b) => b.building_id));
    const restored = stored.selected.filter((id) => existingIds.has(id));

    const incoming = searchParams.get("select");
    if (incoming && existingIds.has(incoming)) {
      if (!restored.includes(incoming)) restored.push(incoming);
      setJustAdded(incoming);
      router.replace(pathname); // consume the param so a refresh doesn't re-add it
      // The client-name field is the very next thing to fill in — hand focus
      // straight to it instead of leaving the broker to find it.
      requestAnimationFrame(() => clientInputRef.current?.focus());
    }

    setSelected(restored);
    setClientName(stored.clientName);
    setPreparedBy(stored.preparedBy);
    setHydrated(true);
    // Intentionally mount-only: re-running this on every `buildings` update
    // (e.g. after a search) would re-apply the ?select= param repeatedly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist every change — but only after the restore above has run, or the
  // pre-hydration empty state would overwrite what was saved.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ selected, clientName, preparedBy }));
    } catch {
      /* storage full/unavailable — the in-page selection still works fine */
    }
  }, [hydrated, selected, clientName, preparedBy]);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function clearSelection() {
    setSelected([]);
    setJustAdded(null);
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
      {justAdded && (
        <Card className="mb-4 border-accent/40 bg-accent/5">
          <p className="text-sm">
            <strong>Added to your library</strong> and ticked below — name a client and generate its PDF, or keep
            browsing to add more first.
          </p>
        </Card>
      )}

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
              className={`transition ${isSelected ? "border-accent ring-1 ring-accent" : ""} ${
                building.building_id === justAdded ? "ring-2 ring-accent" : ""
              }`}
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
                  {(building.public_transport_note || building.accessibility_note || building.airport_note) && (
                    <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
                      {building.public_transport_note && <span>🚉 {building.public_transport_note}</span>}
                      {building.accessibility_note && <span>🛣️ {building.accessibility_note}</span>}
                      {building.airport_note && <span>✈️ {building.airport_note}</span>}
                    </p>
                  )}
                  {building.building_amenities.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {building.building_amenities.slice(0, 6).map((a) => (
                        <span
                          key={a}
                          className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent"
                        >
                          {a}
                        </span>
                      ))}
                      {building.building_amenities.length > 6 && (
                        <span className="px-1 py-0.5 text-[11px] text-muted">
                          +{building.building_amenities.length - 6} more
                        </span>
                      )}
                    </div>
                  )}
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
                onClick={clearSelection}
                className="ml-2 text-xs text-muted underline hover:text-foreground"
              >
                clear
              </button>
            )}
          </div>
          <label className="text-xs">
            <span className="mb-1 block font-medium text-muted">Client</span>
            <input
              ref={clientInputRef}
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

export function BuildingLibrary({ buildings }: { buildings: Building[] }) {
  return (
    <Suspense fallback={null}>
      <BuildingLibraryInner buildings={buildings} />
    </Suspense>
  );
}
