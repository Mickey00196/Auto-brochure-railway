"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import type { Building, Client } from "@/lib/types";
import { downloadLibraryPdf } from "@/lib/generateLibraryPdf";
import { Button } from "@/components/ui";
import { LibraryCard } from "@/components/LibraryCard";
import { shortDate } from "@/components/ClientCard";
import { RemoveFromFolderButton } from "@/components/RemoveFromFolderButton";
import { AddFromLibraryModal } from "@/components/AddFromLibraryModal";
import { LiveLinkPanel } from "@/components/LiveLinkPanel";

/** A client's folder: only buildings explicitly copied in from the shared
 * library, never the library itself. Same photo cards as the library, with
 * "Remove from folder" in place of delete. */
export function ClientFolder({ client: initialClient, buildings: initial }: { client: Client; buildings: Building[] }) {
  const router = useRouter();
  const [client, setClient] = useState(initialClient);
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

  async function generatePdf(e: React.FormEvent) {
    e.preventDefault();
    if (buildings.length === 0) return;
    setGenerating(true);
    setError(null);
    try {
      await downloadLibraryPdf({
        clientName: client.display_name,
        buildingIds: buildings.map((b) => b.building_id),
        preparedBy: preparedBy.trim() || null,
        clientId: client.client_id,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate the PDF");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className={buildings.length > 0 ? "pb-36" : ""}>
      <LiveLinkPanel client={client} onUpdated={setClient} />

      <div className="mb-5 mt-10 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">
          Buildings <span className="ml-1 font-normal tabular-nums text-muted">{buildings.length}</span>
        </h2>
        <Button variant="ghost" onClick={() => setModalOpen(true)}>
          <Plus size={15} aria-hidden="true" />
          Add from library
        </Button>
      </div>

      {buildings.length === 0 ? (
        <div className="rounded-[20px] border-[1.5px] border-dashed border-border px-8 py-14 text-center">
          <h3 className="text-lg font-semibold tracking-tight">No buildings in this folder yet</h3>
          <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-muted">
            Pick buildings from your library. Each one is copied in, so you can tailor it for {client.display_name}{" "}
            without changing the original.
          </p>
          <Button className="mt-6" onClick={() => setModalOpen(true)}>
            <Plus size={15} aria-hidden="true" />
            Add from library
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
          {buildings.map((building) => (
            <LibraryCard
              key={building.building_id}
              building={building}
              cornerAction={<RemoveFromFolderButton building={building} onRemoved={() => handleRemoved(building.building_id)} />}
              note={
                building.created_at ? (
                  <>
                    Copied {shortDate(building.created_at)}
                    {building.source_building_id && (
                      <>
                        {", "}
                        <Link href={`/buildings/${building.source_building_id}`} className="font-medium text-accent hover:underline">
                          open the original
                        </Link>
                      </>
                    )}
                  </>
                ) : null
              }
            />
          ))}
        </div>
      )}

      {buildings.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-4 lg:left-[248px]">
          <form
            onSubmit={generatePdf}
            aria-label="Download this folder as a PDF"
            className="pointer-events-auto flex w-full max-w-[680px] flex-wrap items-center gap-2 rounded-2xl bg-dark p-2 pl-5 text-white shadow-float"
          >
            <span className="text-sm">
              <strong className="font-semibold tabular-nums">{buildings.length}</strong> in this folder
            </span>
            <label className="ml-auto min-w-0 flex-[0_1_200px]">
              <span className="sr-only">Prepared by (optional)</span>
              <input
                value={preparedBy}
                onChange={(e) => setPreparedBy(e.target.value)}
                placeholder="Prepared by (optional)"
                className="h-10 w-full rounded-xl border-0 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/45 focus:bg-white/15"
              />
            </label>
            <button
              type="submit"
              disabled={generating}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-dark disabled:opacity-60"
            >
              {generating && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
              {generating ? "Generating…" : "Download PDF"}
            </button>
            {error && <p className="w-full px-1 pb-1 text-xs text-red-200">{error}</p>}
          </form>
        </div>
      )}

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
