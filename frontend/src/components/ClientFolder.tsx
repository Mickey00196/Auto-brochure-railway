"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Building, Client } from "@/lib/types";
import { downloadLibraryPdf } from "@/lib/generateLibraryPdf";
import { Button, Card } from "@/components/ui";
import { BuildingCard } from "@/components/BuildingCard";
import { RemoveFromFolderButton } from "@/components/RemoveFromFolderButton";
import { AddFromLibraryModal } from "@/components/AddFromLibraryModal";

/** A client's folder: only buildings explicitly copied in from the shared
 * library, never the library itself. Reuses the same BuildingCard as the
 * library page, swapping its checkbox for a "Remove from folder" action. */
export function ClientFolder({ client, buildings: initial }: { client: Client; buildings: Building[] }) {
  const router = useRouter();
  const [buildings, setBuildings] = useState<Building[]>(initial);
  const [modalOpen, setModalOpen] = useState(false);
  const [preparedBy, setPreparedBy] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alreadyAddedSourceIds = new Set(
    buildings.map((b) => b.source_building_id).filter((id): id is string => Boolean(id)),
  );

  function handleAdded(copies: Building[]) {
    setBuildings((prev) => [...prev, ...copies]);
    setModalOpen(false);
    router.refresh();
  }

  function handleRemoved(buildingId: string) {
    setBuildings((prev) => prev.filter((b) => b.building_id !== buildingId));
    router.refresh();
  }

  async function generatePdf() {
    if (buildings.length === 0) return;
    setGenerating(true);
    setError(null);
    try {
      await downloadLibraryPdf({
        clientName: client.display_name,
        buildingIds: buildings.map((b) => b.building_id),
        preparedBy: preparedBy.trim() || null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate the PDF");
    } finally {
      setGenerating(false);
    }
  }

  if (buildings.length === 0) {
    return (
      <>
        <Card>
          <h2 className="text-lg font-semibold">No buildings added yet</h2>
          <p className="mt-1 text-sm text-muted">
            Pick buildings from your shared library to add to {client.display_name}&apos;s folder.
          </p>
          <div className="mt-4">
            <Button onClick={() => setModalOpen(true)}>+ Add from library</Button>
          </div>
        </Card>
        {modalOpen && (
          <AddFromLibraryModal
            clientId={client.client_id}
            clientName={client.display_name}
            alreadyAddedSourceIds={alreadyAddedSourceIds}
            onAdded={handleAdded}
            onClose={() => setModalOpen(false)}
          />
        )}
      </>
    );
  }

  return (
    <div className="pb-64 sm:pb-40">
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setModalOpen(true)}>+ Add from library</Button>
      </div>

      <div className="space-y-3">
        {buildings.map((building) => (
          <BuildingCard
            key={building.building_id}
            building={building}
            provenanceDate={building.created_at ?? null}
            cornerAction={
              <RemoveFromFolderButton building={building} onRemoved={() => handleRemoved(building.building_id)} />
            }
          />
        ))}
      </div>

      {/* max-h + overflow-y-auto backstop — see BuildingLibrary.tsx for why */}
      <div className="fixed inset-x-0 bottom-0 z-20 max-h-[70vh] overflow-y-auto border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end gap-3 px-6 py-4">
          <div className="text-sm">
            <span className="font-semibold">{buildings.length}</span>
            <span className="text-muted"> in this folder</span>
          </div>
          <label className="w-full text-xs sm:w-44">
            <span className="mb-1 block font-medium text-muted">Prepared by (optional)</span>
            <input
              value={preparedBy}
              onChange={(e) => setPreparedBy(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <Button onClick={generatePdf} disabled={generating}>
            {generating ? "Generating…" : "Generate PDF"}
          </Button>
          {error && <p className="w-full text-xs text-red-500">{error}</p>}
        </div>
      </div>

      {modalOpen && (
        <AddFromLibraryModal
          clientId={client.client_id}
          clientName={client.display_name}
          alreadyAddedSourceIds={alreadyAddedSourceIds}
          onAdded={handleAdded}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
