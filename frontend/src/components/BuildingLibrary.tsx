"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, LayoutGrid, List, Loader2, Map as MapIcon, Plus, Search, X } from "lucide-react";
import type { Building, Client } from "@/lib/types";
import { api } from "@/lib/api";
import { downloadLibraryPdf } from "@/lib/generateLibraryPdf";
import { formatArea } from "@/lib/format";
import { ButtonLink } from "@/components/ui";
import { DeleteBuildingButton } from "@/components/DeleteBuildingButton";
import { BuildingCard } from "@/components/BuildingCard";
import { LibraryCard, buildingArea, rentValue } from "@/components/LibraryCard";
import type { MapBuilding } from "@/components/ShortlistMap";

const ShortlistMap = dynamic(() => import("@/components/ShortlistMap"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-muted">Loading map…</div>,
});

// A ticked selection used to be plain component state, so navigating away
// mid-shortlist — to capture one more listing, say — silently threw it away.
// Persisting it here is what makes "capture five, then select and send" a
// single unbroken task instead of five separate ones.
const STORAGE_KEY = "office-shortlist:library-selection";
const VIEW_KEY = "office-shortlist:library-view";

type View = "grid" | "list" | "map";
type Pricing = "all" | "direct" | "flex";

type StoredSelection = { selected: string[]; clientName: string; preparedBy: string };

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

function readStoredView(): View {
  try {
    const v = window.localStorage.getItem(VIEW_KEY);
    return v === "list" || v === "map" ? v : "grid";
  } catch {
    return "grid";
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

const chipClass = (active: boolean) =>
  `h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition-colors ${
    active ? "border-dark bg-dark text-white" : "border-border bg-surface text-foreground hover:border-foreground/30"
  }`;

/** The library: every captured building, filterable, as photo cards, rows or
 * on a map. Tick buildings to add them to a client's folder or to make an
 * ad-hoc PDF. Selection order is preserved — it's the order in the PDF. */
function BuildingLibraryInner({ buildings }: { buildings: Building[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [selected, setSelected] = useState<string[]>([]);
  const [clientName, setClientName] = useState("");
  const [preparedBy, setPreparedBy] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [view, setView] = useState<View>("grid");
  const [query, setQuery] = useState("");
  const [pricing, setPricing] = useState<Pricing>("all");
  const [bigOnly, setBigOnly] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const [pdfOpen, setPdfOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [clients, setClients] = useState<Client[] | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clientInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Restore the persisted selection and view on load, reconciled against
  // buildings that still exist, and fold in a ?select=<id> from a
  // just-completed capture. Deferred a tick so no setState runs
  // synchronously in the effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    queueMicrotask(() => {
      const stored = readStoredSelection();
      const existingIds = new Set(buildings.map((b) => b.building_id));
      const restored = stored.selected.filter((id) => existingIds.has(id));
      const incoming = searchParams.get("select");
      if (incoming && existingIds.has(incoming)) {
        if (!restored.includes(incoming)) restored.push(incoming);
        setJustAdded(incoming);
        router.replace(pathname); // consume the param so a refresh doesn't re-add it
      }
      setSelected(restored);
      setClientName(stored.clientName);
      setPreparedBy(stored.preparedBy);
      setView(readStoredView());
      setHydrated(true);
    });
    // Intentionally mount-only: re-running on every `buildings` update would
    // re-apply the ?select= param repeatedly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist every change — but only after the restore above has run, or the
  // pre-hydration empty state would overwrite what was saved.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ selected, clientName, preparedBy }));
      window.localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* storage full/unavailable — the in-page selection still works fine */
    }
  }, [hydrated, selected, clientName, preparedBy, view]);

  // Close the "Add to client" menu on an outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Load the client list as soon as something is ticked, so "Add to client"
  // opens instantly instead of showing a loading line.
  const hasSelection = selected.length > 0;
  useEffect(() => {
    if (!hasSelection || clients !== null) return;
    let cancelled = false;
    api
      .clients()
      .then((cs) => !cancelled && setClients([...cs].sort((a, b) => b.updated_at.localeCompare(a.updated_at))))
      .catch(() => !cancelled && setClients([]));
    return () => {
      cancelled = true;
    };
  }, [hasSelection, clients]);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function clearSelection() {
    setSelected([]);
    setJustAdded(null);
    setPdfOpen(false);
    setMenuOpen(false);
  }

  function handleBuildingDeleted(buildingId: string) {
    setSelected((prev) => prev.filter((id) => id !== buildingId));
    if (justAdded === buildingId) setJustAdded(null);
    router.refresh();
  }

  function openMenu() {
    setMenuOpen((o) => !o);
    setPdfOpen(false);
    if (clients === null) {
      api
        .clients()
        .then((cs) => setClients([...cs].sort((a, b) => b.updated_at.localeCompare(a.updated_at))))
        .catch(() => setClients([]));
    }
  }

  async function addToClient(client: Client) {
    setAdding(client.client_id);
    setError(null);
    try {
      // Skip buildings this folder already has a copy of — the same rule as
      // the folder's own "Add from library" picker.
      const existing = await api.buildings(client.client_id);
      const already = new Set(existing.map((b) => b.source_building_id));
      const toCopy = selected.filter((id) => !already.has(id));
      for (const id of toCopy) await api.copyBuildingToClient(id, client.client_id);
      clearSelection();
      router.push(`/clients/${client.client_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add these buildings");
      setAdding(null);
    }
  }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!clientName.trim() || selected.length === 0) return;
    setGenerating(true);
    setError(null);
    try {
      await downloadLibraryPdf({
        clientName: clientName.trim(),
        buildingIds: selected,
        preparedBy: preparedBy.trim() || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate the PDF");
    } finally {
      setGenerating(false);
    }
  }

  const q = query.trim().toLowerCase();
  const visible = buildings.filter((b) => {
    if (q && !`${b.name} ${b.address} ${b.city} ${b.submarket ?? ""}`.toLowerCase().includes(q)) return false;
    if (pricing === "direct" && !b.units.some((u) => u.pricing_model !== "per_desk_monthly")) return false;
    if (pricing === "flex" && !b.units.some((u) => u.pricing_model === "per_desk_monthly")) return false;
    if (bigOnly && buildingArea(b) < 500) return false;
    return true;
  });
  const mapBuildings: MapBuilding[] = visible.flatMap((b, i) =>
    typeof b.latitude === "number" && typeof b.longitude === "number"
      ? [
          {
            id: b.building_id,
            number: pad(i + 1),
            name: b.address || b.name,
            address: [b.postal_code, b.city].filter(Boolean).join(" "),
            available: buildingArea(b) > 0 ? formatArea(buildingArea(b)) : "Area TBD",
            city: b.city,
            lat: b.latitude,
            lng: b.longitude,
            href: `/buildings/${b.building_id}`,
          },
        ]
      : [],
  );
  const offMap = visible.length - mapBuildings.length;

  if (buildings.length === 0) {
    return (
      <div className="rounded-[20px] border-[1.5px] border-dashed border-border px-8 py-14 text-center">
        <h2 className="text-xl font-semibold tracking-tight">Your library is empty</h2>
        <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-muted">
          Open a listing on Funda in Business and click the Chrome extension, or add a building by hand.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <ButtonLink href="/buildings/new">
            <Plus size={15} aria-hidden="true" />
            Add a building
          </ButtonLink>
          <ButtonLink href="/import" variant="ghost">
            Import links
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className={selected.length > 0 ? "pb-40" : ""}>
      {justAdded && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl bg-accent/10 px-4 py-3 text-sm">
          <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />
          <p>
            <strong className="font-semibold">Added to your library</strong> and ticked below. Add it to a client, or
            keep capturing.
          </p>
          <button
            type="button"
            onClick={() => setJustAdded(null)}
            aria-label="Dismiss"
            className="ml-auto rounded-full p-1 text-muted hover:text-foreground"
          >
            <X size={15} />
          </button>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-[1_1_240px] sm:max-w-[320px]">
          <label htmlFor="library-search" className="sr-only">
            Search the library
          </label>
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            id="library-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Street, area or city"
            className="h-10 w-full rounded-full border border-border bg-surface pl-10 pr-4 text-sm outline-none transition placeholder:text-placeholder focus:border-accent focus:ring-4 focus:ring-accent/10"
          />
        </div>
        <div role="group" aria-label="Pricing" className="flex gap-1.5 overflow-x-auto">
          {(
            [
              ["all", "All"],
              ["direct", "Direct lease"],
              ["flex", "Flex"],
            ] as [Pricing, string][]
          ).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={pricing === value} onClick={() => setPricing(value)} className={chipClass(pricing === value)}>
              {label}
            </button>
          ))}
          <button type="button" aria-pressed={bigOnly} onClick={() => setBigOnly((v) => !v)} className={chipClass(bigOnly)}>
            Over 500 m²
          </button>
        </div>
        <span className="ml-auto text-sm tabular-nums text-muted">
          {visible.length === buildings.length ? `${buildings.length} buildings` : `${visible.length} of ${buildings.length}`}
        </span>
        <div role="group" aria-label="View" className="inline-flex rounded-full bg-surface p-1 shadow-card">
          {(
            [
              ["grid", "Grid view", LayoutGrid],
              ["list", "List view", List],
              ["map", "Map view", MapIcon],
            ] as [View, string, typeof LayoutGrid][]
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-label={label}
              title={label}
              aria-pressed={view === value}
              onClick={() => setView(value)}
              className={`flex h-8 w-9 items-center justify-center rounded-full transition-colors ${
                view === value ? "bg-dark text-white" : "text-muted hover:text-foreground"
              }`}
            >
              <Icon size={15} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-[20px] border-[1.5px] border-dashed border-border px-8 py-12 text-center text-[15px] text-muted">
          No buildings match these filters.{" "}
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setPricing("all");
              setBigOnly(false);
            }}
            className="font-medium text-accent hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
          {visible.map((b) => (
            <LibraryCard
              key={b.building_id}
              building={b}
              selected={selected.includes(b.building_id)}
              onToggle={() => toggle(b.building_id)}
              highlighted={b.building_id === justAdded}
              cornerAction={<DeleteBuildingButton building={b} onDeleted={() => handleBuildingDeleted(b.building_id)} />}
            />
          ))}
        </div>
      ) : view === "list" ? (
        <div className="flex flex-col gap-3">
          {visible.map((b) => (
            <BuildingCard
              key={b.building_id}
              building={b}
              selected={selected.includes(b.building_id)}
              highlighted={b.building_id === justAdded}
              cornerAction={<DeleteBuildingButton building={b} onDeleted={() => handleBuildingDeleted(b.building_id)} />}
              leading={
                <label className="flex h-11 w-11 cursor-pointer items-center justify-center">
                  <input
                    type="checkbox"
                    checked={selected.includes(b.building_id)}
                    onChange={() => toggle(b.building_id)}
                    aria-label={`Select ${b.address || b.name}`}
                    className="h-[18px] w-[18px] cursor-pointer accent-accent"
                  />
                </label>
              }
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="h-[420px] overflow-hidden rounded-[20px] bg-surface shadow-card sm:h-[620px]">
            {mapBuildings.length > 0 ? (
              <ShortlistMap buildings={mapBuildings} city={null} hoveredId={hoveredId} />
            ) : (
              <div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted">
                None of these buildings has a location yet. Open one and use “Look up distances” to place it.
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-2 lg:max-h-[620px] lg:overflow-y-auto lg:pr-1">
            {offMap > 0 && (
              <p className="px-1 pb-1 text-xs text-muted">
                {offMap} building{offMap === 1 ? " has" : "s have"} no location yet and {offMap === 1 ? "isn’t" : "aren’t"} on the map.
              </p>
            )}
            {mapBuildings.map((m) => {
              const b = visible.find((x) => x.building_id === m.id)!;
              const isSel = selected.includes(b.building_id);
              return (
                <div
                  key={m.id}
                  onMouseEnter={() => setHoveredId(m.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`relative flex items-center gap-3 rounded-2xl border bg-surface p-3 transition-colors ${
                    isSel ? "border-accent/40 bg-accent/5" : hoveredId === m.id ? "border-foreground/20" : "border-transparent shadow-card"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums text-white ${
                      isSel ? "bg-accent" : "bg-dark"
                    }`}
                  >
                    {m.number}
                  </span>
                  <Link href={m.href!} className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold hover:text-accent">{m.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {m.available}, {rentValue(b)}
                    </span>
                  </Link>
                  <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggle(b.building_id)}
                      aria-label={`Select ${m.name}`}
                      className="h-[18px] w-[18px] cursor-pointer accent-accent"
                    />
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selected.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-4 lg:left-[248px]">
          <div role="region" aria-label="Selected buildings" className="pointer-events-auto relative w-full max-w-[680px] rounded-2xl bg-dark p-2 text-white shadow-float">
            {pdfOpen && (
              <form onSubmit={generate} className="flex flex-wrap items-end gap-2 border-b border-white/15 px-2 pb-3 pt-1">
                <label className="min-w-0 flex-[1_1_180px] text-xs text-white/70">
                  Client name
                  <input
                    ref={clientInputRef}
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    required
                    placeholder="Shown on the cover"
                    className="mt-1 h-10 w-full rounded-xl border-0 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/40 focus:bg-white/15"
                  />
                </label>
                <label className="min-w-0 flex-[1_1_150px] text-xs text-white/70">
                  Prepared by (optional)
                  <input
                    value={preparedBy}
                    onChange={(e) => setPreparedBy(e.target.value)}
                    placeholder="Your name"
                    className="mt-1 h-10 w-full rounded-xl border-0 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/40 focus:bg-white/15"
                  />
                </label>
                <button
                  type="submit"
                  disabled={generating || !clientName.trim()}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-dark disabled:opacity-60"
                >
                  {generating && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                  {generating ? "Generating…" : "Download PDF"}
                </button>
              </form>
            )}
            <div className="flex flex-wrap items-center gap-2 pl-3">
              <span className="text-sm">
                <strong className="font-semibold tabular-nums">{selected.length}</strong> selected
              </span>
              <button type="button" onClick={clearSelection} className="rounded-lg px-2 py-1 text-sm text-white/65 hover:text-white">
                Clear
              </button>
              <div className="ml-auto flex items-center gap-2">
                <div ref={menuRef} className="relative">
                  <button
                    type="button"
                    onClick={openMenu}
                    aria-expanded={menuOpen}
                    aria-haspopup="menu"
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-white px-4 text-sm font-semibold text-dark"
                  >
                    Add to client
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                  {menuOpen && (
                    <div
                      role="menu"
                      className="absolute bottom-[calc(100%+12px)] right-0 w-72 max-w-[calc(100vw-2rem)] rounded-2xl bg-surface p-2 text-foreground shadow-float"
                    >
                      {clients === null ? (
                        <p className="px-3 py-2.5 text-sm text-muted">Loading clients…</p>
                      ) : clients.length === 0 ? (
                        <p className="px-3 py-2.5 text-sm text-muted">No clients yet.</p>
                      ) : (
                        <div className="max-h-64 overflow-y-auto">
                          {clients.map((c) => (
                            <button
                              key={c.client_id}
                              type="button"
                              role="menuitem"
                              disabled={adding !== null}
                              onClick={() => addToClient(c)}
                              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-input-bg disabled:opacity-60"
                            >
                              <span className="min-w-0 flex-1 truncate font-medium">{c.display_name}</span>
                              <span className="shrink-0 text-xs text-muted">
                                {adding === c.client_id ? "Adding…" : `${c.building_count} in folder`}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
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
                <button
                  type="button"
                  onClick={() => {
                    setPdfOpen((o) => !o);
                    setMenuOpen(false);
                    requestAnimationFrame(() => clientInputRef.current?.focus());
                  }}
                  aria-expanded={pdfOpen}
                  className={`h-10 rounded-xl border px-4 text-sm font-medium transition-colors ${
                    pdfOpen ? "border-white bg-white/10" : "border-white/30 hover:bg-white/10"
                  }`}
                >
                  PDF
                </button>
              </div>
            </div>
            {error && <p className="px-3 pb-1 pt-2 text-xs text-red-200">{error}</p>}
          </div>
        </div>
      )}
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
