"use client";

import { useState } from "react";
import type { Building } from "@/lib/types";
import { api } from "@/lib/api";
import { ConfirmDialog } from "@/components/ui";

/** The ✕ in a building card's top-right corner — deletes it from the
 * library entirely (not just this list), so it asks first. Used from both
 * the library and a selection's editor, since they show the same cards. */
export function DeleteBuildingButton({ building, onDeleted }: { building: Building; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    setDeleting(true);
    setError(null);
    try {
      await api.deleteBuilding(building.building_id);
      setConfirming(false);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the building");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={`Delete ${building.address}`}
        title="Delete building"
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
          title="Delete this building?"
          message={
            <>
              <strong>{building.address}</strong>{" "}
              will be permanently removed from your library, including its spaces and add-ons, and dropped from
              any saved selections. This can&apos;t be undone.
            </>
          }
          confirmLabel={deleting ? "Deleting…" : "Yes, delete"}
          cancelLabel="No, keep it"
          busy={deleting}
          error={error}
          onConfirm={confirmDelete}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
