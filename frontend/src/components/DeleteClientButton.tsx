"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Client } from "@/lib/types";
import { api } from "@/lib/api";
import { Button, ConfirmDialog } from "@/components/ui";

/** Deleting a client cascades every building copied into their folder (the
 * backend cascade, not a live library link — see services/building_copy.py)
 * but never touches the library masters those copies came from. */
export function DeleteClientButton({ client }: { client: Client }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    setDeleting(true);
    setError(null);
    try {
      await api.deleteClient(client.client_id);
      router.push("/clients");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete this client");
      setDeleting(false);
    }
  }

  return (
    <>
      <Button variant="ghost" onClick={() => setConfirming(true)}>
        Delete client
      </Button>

      {confirming && (
        <ConfirmDialog
          title="Delete this client?"
          message={
            <>
              <strong>{client.display_name}</strong> and every building copied into their folder (
              {client.building_count}) will be permanently removed. Buildings in your shared library —
              including the masters these were copied from — are not affected. This can&apos;t be undone.
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
