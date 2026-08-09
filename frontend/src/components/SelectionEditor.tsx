"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Building, Selection } from "@/lib/types";
import { api, PROXY_BASE_URL } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";
import { formatArea } from "@/lib/format";

export function SelectionEditor({ selection, buildings }: { selection: Selection; buildings: Building[] }) {
  const router = useRouter();

  const [selected, setSelected] = useState<string[]>(selection.building_ids);
  const [clientName, setClientName] = useState(selection.client_name);
  const [preparedBy, setPreparedBy] = useState(selection.prepared_by ?? "");
  const [query, setQuery] = useState("");

  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty =
    clientName !== selection.client_name ||
    (preparedBy || null) !== selection.prepared_by ||
    selected.length !== selection.building_ids.length ||
    selected.some((id, i) => id !== selection.building_ids[i]);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save(): Promise<Selection | null> {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateSelection(selection.selection_id, {
        client_name: clientName.trim() || "Untitled selection",
        prepared_by: preparedBy.trim() || null,
        building_ids: selected,
      });
      selection.client_name = updated.client_name;
      selection.prepared_by = updated.prepared_by;
      selection.building_ids = updated.building_ids;
      setSavedAt(Date.now());
      return updated;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the selection");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function generate() {
    if (!clientName.trim() || selected.length === 0) return;
    setGenerating(true);
    setError(null);
    try {
      const ok = await save();
      if (!ok) return;
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

  async function duplicate() {
    setBusy(true);
    setError(null);
    try {
      const copy = await api.createSelection({
        client_name: `${clientName.trim() || selection.client_name} (copy)`,
        prepared_by: preparedBy.trim() || null,
        building_ids: selected,
      });
      router.push(`/selections/${copy.selection_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not duplicate the selection");
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete the selection for "${selection.client_name}"? This can't be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteSelection(selection.selection_id);
      router.push("/selections");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the selection");
      setBusy(false);
    }
  }

  const visible = buildings.filter((b) => {
    if (!query.trim()) return true;
    const haystack = `${b.name} ${b.address} ${b.city} ${b.submarket ?? ""}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  return (
    <div className="pb-40">
      <Card className="mb-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Client</span>
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Client name"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Prepared by (optional)</span>
            <input
              value={preparedBy}
              onChange={(e) => setPreparedBy(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          <Button variant="ghost" onClick={duplicate} disabled={busy}>
            Duplicate
          </Button>
          <Button variant="ghost" onClick={remove} disabled={busy}>
            Delete
          </Button>
          {!dirty && savedAt && <span className="text-xs text-muted">Saved</span>}
          {dirty && <span className="text-xs text-muted">Unsaved changes</span>}
        </div>
      </Card>

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

          return (
            <Card key={building.building_id} className={`transition ${isSelected ? "border-accent ring-1 ring-accent" : ""}`}>
              <div className="flex items-start gap-4">
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
                  <p className="text-sm text-muted">{[building.submarket, building.city].filter(Boolean).join(" · ")}</p>
                  <p className="mt-1 text-sm">
                    <span className="font-medium">{totalAvailable > 0 ? formatArea(totalAvailable) : "Area TBD"}</span>
                  </p>
                </Link>
                <Badge>{building.units.length} space{building.units.length === 1 ? "" : "s"}</Badge>
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

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-6 py-4">
          <div className="text-sm">
            <span className="font-semibold">{selected.length}</span>
            <span className="text-muted"> selected</span>
          </div>
          <Button onClick={generate} disabled={generating || selected.length === 0 || !clientName.trim()}>
            {generating ? "Generating…" : "Save & generate PDF"}
          </Button>
          {error && <p className="w-full text-xs text-red-500">{error}</p>}
        </div>
      </div>
    </div>
  );
}
