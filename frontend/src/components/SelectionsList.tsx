"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Building, Selection } from "@/lib/types";
import { api } from "@/lib/api";
import { Button, Card } from "@/components/ui";

function formatUpdated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function SelectionsList({ selections, buildings }: { selections: Selection[]; buildings: Building[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buildingById = new Map(buildings.map((b) => [b.building_id, b]));

  async function createNew() {
    setCreating(true);
    setError(null);
    try {
      const created = await api.createSelection({ client_name: "New selection", building_ids: [] });
      router.push(`/selections/${created.selection_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the selection");
      setCreating(false);
    }
  }

  async function duplicate(s: Selection) {
    setBusyId(s.selection_id);
    setError(null);
    try {
      const copy = await api.createSelection({
        client_name: `${s.client_name} (copy)`,
        prepared_by: s.prepared_by,
        building_ids: s.building_ids,
      });
      router.push(`/selections/${copy.selection_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not duplicate the selection");
      setBusyId(null);
    }
  }

  async function remove(s: Selection) {
    if (!window.confirm(`Delete the selection for "${s.client_name}"? This can't be undone.`)) return;
    setBusyId(s.selection_id);
    setError(null);
    try {
      await api.deleteSelection(s.selection_id);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the selection");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">
          {selections.length} saved selection{selections.length === 1 ? "" : "s"}
        </p>
        <Button onClick={createNew} disabled={creating}>
          {creating ? "Creating…" : "+ New selection"}
        </Button>
      </div>

      {error && (
        <Card className="mb-4 border-red-300 bg-red-50 text-red-700">
          <p className="text-sm">{error}</p>
        </Card>
      )}

      {selections.length === 0 ? (
        <Card>
          <h2 className="text-lg font-semibold">No saved selections yet</h2>
          <p className="mt-1 text-sm text-muted">
            Tick buildings in the library and use &quot;Save as selection&quot; to keep a client&apos;s shortlist
            around — or start one here.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {selections.map((s) => {
            const resolved = s.building_ids.map((id) => buildingById.get(id)).filter((b): b is Building => !!b);
            const preview = resolved.slice(0, 3).map((b) => b.address);
            const busy = busyId === s.selection_id;
            return (
              <Card key={s.selection_id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <Link href={`/selections/${s.selection_id}`} className="group flex-1">
                    <p className="font-semibold group-hover:text-accent group-hover:underline">{s.client_name}</p>
                    <p className="text-sm text-muted">
                      {s.building_ids.length} building{s.building_ids.length === 1 ? "" : "s"}
                      {preview.length > 0 && ` · ${preview.join(", ")}`}
                      {s.building_ids.length > preview.length && ` +${s.building_ids.length - preview.length} more`}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {s.prepared_by && `Prepared by ${s.prepared_by} · `}
                      Updated {formatUpdated(s.updated_at)}
                    </p>
                  </Link>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="ghost" onClick={() => duplicate(s)} disabled={busy}>
                      Duplicate
                    </Button>
                    <Button variant="ghost" onClick={() => remove(s)} disabled={busy}>
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
