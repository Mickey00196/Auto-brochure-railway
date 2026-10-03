"use client";

import { useState } from "react";
import type { Building } from "@/lib/types";
import { api } from "@/lib/api";
import { ConfirmDialog } from "@/components/ui";

/** The ✕ on a building card inside a client folder — deletes this client's
 * copy only. The library master (and any other client's copy of it) is
 * untouched, since a folder's buildings are independent rows, not a live
 * view onto the library. */
export function RemoveFromFolderButton({ building, onRemoved }: { building: Building; onRemoved: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmRemove() {
    setRemoving(true);
    setError(null);
    try {
      await api.deleteBuilding(building.building_id);
      setConfirming(false);
      onRemoved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove this building");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={`Remove ${building.address} from this folder`}
        title="Remove from folder"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setError(null);
          setConfirming(true);
        }}
        className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full text-muted transition hover:bg-red-500/10 hover:text-red-600"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M2 2 12 12M12 2 2 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      </button>

      {confirming && (
        <ConfirmDialog
          title="Remove from this folder?"
          message={
            <>
              <strong>{building.address}</strong> will be removed from this client&apos;s folder. The building
              stays in your shared library and in any other client&apos;s folder.
            </>
          }
          confirmLabel={removing ? "Removing…" : "Yes, remove"}
          cancelLabel="No, keep it"
          busy={removing}
          error={error}
          onConfirm={confirmRemove}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
