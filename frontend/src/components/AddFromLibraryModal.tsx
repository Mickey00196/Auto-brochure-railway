"use client";

import { useEffect, useState } from "react";
import type { Building } from "@/lib/types";
import { api } from "@/lib/api";
import { Button } from "@/components/ui";
import { BuildingCard } from "@/components/BuildingCard";

/** "+ Add from library" inside a client folder: browse the shared library,
 * tick buildings, add them — each tick becomes a full independent copy
 * scoped to this client (POST /buildings/{id}/copy-to-client), never a
 * live reference. Buildings already copied into this folder show locked,
 * matched by source_building_id so re-adding isn't possible from here. */
export function AddFromLibraryModal({
  clientId,
  clientName,
  alreadyAddedSourceIds,
  onAdded,
  onClose,
}: {
  clientId: string;
  clientName: string;
  alreadyAddedSourceIds: Set<string>;
  onAdded: (copies: Building[]) => void;
  onClose: () => void;
}) {
  const [buildings, setBuildings] = useState<Building[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .buildings()
      .then((all) => {
        if (!cancelled) setBuildings(all);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load the library");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function addPicked() {
    if (picked.length === 0) return;
    setAdding(true);
    setAddError(null);
    try {
      const copies = await Promise.all(picked.map((id) => api.copyBuildingToClient(id, clientId)));
      onAdded(copies);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Could not add the selected buildings");
    } finally {
      setAdding(false);
    }
  }

  const visible = (buildings ?? []).filter((b) => {
    if (!query.trim()) return true;
    const haystack = `${b.name} ${b.address} ${b.city} ${b.submarket ?? ""}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-from-library-title"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-2xl flex-col border-l border-border bg-background shadow-lg"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-6">
          <div>
            <h2 id="add-from-library-title" className="text-lg font-semibold">
              Add from library
            </h2>
            <p className="mt-1 text-sm text-muted">
              Pick buildings to copy into {clientName}&apos;s folder. Each copy is independent — editing it here
              won&apos;t change the library.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-border/40 hover:text-foreground"
          >
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 2 12 12M12 2 2 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="border-b border-border p-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by address, city or area…"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loadError && <p className="text-sm text-red-500">{loadError}</p>}
          {!loadError && buildings === null && <p className="text-sm text-muted">Loading your library…</p>}
          {buildings !== null && buildings.length === 0 && (
            <p className="text-sm text-muted">Your library is empty — add a building first.</p>
          )}
          {buildings !== null && buildings.length > 0 && visible.length === 0 && (
            <p className="text-sm text-muted">No buildings match “{query}”.</p>
          )}

          <div className="space-y-3">
            {visible.map((building) => {
              const locked = alreadyAddedSourceIds.has(building.building_id);
              return (
                <div
                  key={building.building_id}
                  className={locked ? "pointer-events-none" : "cursor-pointer"}
                  onClick={() => !locked && toggle(building.building_id)}
                >
                  <BuildingCard
                    building={building}
                    selected={picked.includes(building.building_id)}
                    locked={locked}
                    leading={
                      <label
                        className="-m-2 shrink-0 cursor-pointer p-2"
                        aria-label={`Select ${building.address}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={picked.includes(building.building_id)}
                          disabled={locked}
                          onChange={() => toggle(building.building_id)}
                          className="mt-1 h-5 w-5 cursor-pointer accent-accent disabled:cursor-not-allowed"
                        />
                      </label>
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-border bg-background p-4">
          {addError && <p className="mb-2 text-xs text-red-500">{addError}</p>}
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={onClose} disabled={adding}>
              Cancel
            </Button>
            <Button onClick={addPicked} disabled={adding || picked.length === 0}>
              {adding ? "Adding…" : `Add ${picked.length} to ${clientName}'s folder`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
