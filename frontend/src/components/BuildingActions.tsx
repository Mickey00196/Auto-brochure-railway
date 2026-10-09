"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, Loader2, Pencil, Plus } from "lucide-react";
import type { Client } from "@/lib/types";
import { api } from "@/lib/api";
import { downloadLibraryPdf } from "@/lib/generateLibraryPdf";

const ghost =
  "inline-flex h-[38px] items-center gap-2 rounded-xl border border-border bg-surface px-3.5 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent";
const popover = "absolute right-0 top-[calc(100%+8px)] z-30 w-72 max-w-[calc(100vw-2rem)] rounded-2xl bg-surface p-2 text-foreground shadow-float";

/** Edit / PDF / Add to client for the building page header. A client's copy
 * gets Edit and PDF only — copies can't be copied on to another client. */
export function BuildingActions({
  buildingId,
  buildingName,
  isClientCopy,
  clientId,
  alreadyIn,
}: {
  buildingId: string;
  buildingName: string;
  isClientCopy: boolean;
  /** For a client's copy: its folder, so the PDF picks up that client's brief. */
  clientId?: string | null;
  /** Client ids that already hold a copy of this library building. */
  alreadyIn: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<"pdf" | "client" | null>(null);
  const [clients, setClients] = useState<Client[] | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Fetch the client list up front so "Add to client" opens ready, instead
  // of on a "Loading clients…" line.
  useEffect(() => {
    if (isClientCopy) return;
    let cancelled = false;
    api
      .clients()
      .then((cs) => !cancelled && setClients([...cs].sort((a, b) => b.updated_at.localeCompare(a.updated_at))))
      .catch(() => !cancelled && setClients([]));
    return () => {
      cancelled = true;
    };
  }, [isClientCopy]);

  function toggle(which: "pdf" | "client") {
    setError(null);
    setOpen((o) => (o === which ? null : which));
  }

  async function addTo(client: Client) {
    setAdding(client.client_id);
    setError(null);
    try {
      await api.copyBuildingToClient(buildingId, client.client_id);
      router.push(`/clients/${client.client_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add the building.");
      setAdding(null);
    }
  }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!clientName.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      await downloadLibraryPdf({
        clientName: clientName.trim(),
        buildingIds: [buildingId],
        preparedBy: null,
        clientId: clientId ?? undefined,
      });
      setOpen(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't make the PDF.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div ref={ref} className="flex flex-wrap items-center gap-2">
      <Link href={`/buildings/${buildingId}/edit`} className={ghost}>
        <Pencil size={14} aria-hidden="true" />
        Edit
      </Link>

      <div className="relative">
        <button type="button" onClick={() => toggle("pdf")} aria-expanded={open === "pdf"} className={ghost}>
          <Download size={14} aria-hidden="true" />
          PDF
        </button>
        {open === "pdf" && (
          <form onSubmit={generate} className={`${popover} p-4`}>
            <label className="block text-sm font-medium">
              Prepared for
              <input
                autoFocus
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Client name"
                className="mt-2 h-10 w-full rounded-xl border border-transparent bg-input-bg px-3 text-sm font-normal focus:border-accent focus:bg-surface focus:outline-none"
              />
            </label>
            <p className="mt-2 text-xs text-muted">A one-building availability PDF of {buildingName}.</p>
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={generating || !clientName.trim()}
              className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-dark text-sm font-semibold text-white disabled:opacity-50"
            >
              {generating && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
              {generating ? "Making the PDF…" : "Download PDF"}
            </button>
          </form>
        )}
      </div>

      {!isClientCopy && (
        <div className="relative">
          <button
            type="button"
            onClick={() => toggle("client")}
            aria-expanded={open === "client"}
            aria-haspopup="menu"
            className="inline-flex h-[38px] items-center gap-2 rounded-xl bg-dark px-4 text-sm font-medium text-white transition hover:bg-dark/90"
          >
            <Plus size={15} aria-hidden="true" />
            Add to client
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          {open === "client" && (
            <div role="menu" className={popover}>
              {clients === null ? (
                <p className="px-3 py-2.5 text-sm text-muted">Loading clients…</p>
              ) : clients.length === 0 ? (
                <p className="px-3 py-2.5 text-sm text-muted">No clients yet.</p>
              ) : (
                <div className="max-h-64 overflow-y-auto">
                  {clients.map((c) => {
                    const has = alreadyIn.includes(c.client_id);
                    return (
                      <button
                        key={c.client_id}
                        type="button"
                        role="menuitem"
                        disabled={adding !== null || has}
                        onClick={() => addTo(c)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-input-bg disabled:cursor-default disabled:hover:bg-transparent"
                      >
                        <span className={`min-w-0 flex-1 truncate font-medium ${has ? "text-muted" : ""}`}>{c.display_name}</span>
                        <span className="shrink-0 text-xs text-muted">
                          {adding === c.client_id ? "Adding…" : has ? "Already added" : `${c.building_count} in folder`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {error && <p className="px-3 py-2 text-xs text-red-600">{error}</p>}
              <Link
                href="/clients/new"
                role="menuitem"
                className="mt-1 flex items-center gap-2 border-t border-border px-3 pb-1.5 pt-3 text-sm font-medium text-accent"
              >
                <Plus size={14} aria-hidden="true" />
                New client
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
