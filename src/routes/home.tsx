import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Building2, Camera, Check, FolderPlus, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteShell } from "@/components/sandbox-site";

const initialFolders = [
  { name: "Acme BV", count: 3, live: true, updated: "1 Oct 2026", initials: "AB" },
  { name: "Northline Partners", count: 3, live: true, updated: "28 Sep 2026", initials: "NP" },
  { name: "Studio Noord", count: 2, live: false, updated: "24 Sep 2026", initials: "SN" },
  { name: "Meridian Group", count: 5, live: false, updated: "19 Sep 2026", initials: "MG" },
];

export const Route = createFileRoute("/home")({
  head: () => ({ meta: [
    { title: "Home — Office Shortlist" },
    { name: "description", content: "Search your clients, open a recent client, or capture a building for the Office Shortlist library." },
    { property: "og:title", content: "Home — Office Shortlist" },
    { property: "og:description", content: "Search clients and manage building shortlists in the Office Shortlist design sandbox." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: HomePage,
});

function LivePill({ live }: { live: boolean }) {
  return live
    ? <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success-surface px-2.5 py-1 text-[11px] font-medium text-success"><span className="size-1.5 rounded-full bg-success" />Live</span>
    : <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-muted-foreground">Not shared yet</span>;
}

function HomePage() {
  const [folders, setFolders] = useState(initialFolders);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const matches = query ? folders.filter(f => f.name.toLowerCase().includes(query)) : [];

  function createFolder(e: React.FormEvent) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    setFolders([{ name: clean, count: 0, live: false, updated: "1 Oct 2026", initials: clean.split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase() }, ...folders]);
    setCreating(false); setName("");
  }

  return <SiteShell>
    <section className="relative mx-auto max-w-2xl pt-10 text-center sm:pt-16">
      <div aria-hidden="true" className="home-glow pointer-events-none absolute left-1/2 top-[-80px] h-[400px] w-[min(48rem,100vw)] -translate-x-1/2" />
      <h1 className="relative text-3xl font-semibold tracking-tight text-foreground sm:text-[2.6rem] sm:leading-tight">Find a client</h1>
      <p className="relative mx-auto mt-3 max-w-md text-sm text-muted-foreground sm:text-base">Search the clients you share buildings with, or start a new one.</p>

      <div className="relative mx-auto mt-8 max-w-xl">
        <div className="relative">
          <Search size={20} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search clients"
            placeholder="Find a client…"
            className="h-14 w-full rounded-2xl border border-input bg-card pl-12 pr-5 text-base text-foreground shadow-panel outline-none transition-all placeholder:text-muted-foreground focus:border-link focus:ring-2 focus:ring-ring/20 sm:h-16 sm:text-lg"
          />
        </div>

        <div className="mt-4 flex justify-center">
          <button onClick={() => { setSearch(""); setCreating(true); }} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-semibold text-primary shadow-panel transition-colors hover:border-link/50 hover:bg-accent/40">
            <Plus size={16} /> New client
          </button>
        </div>

        {query !== "" && <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-border bg-card text-left shadow-popup">
          <p className="border-b border-border bg-subtle px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Search results</p>
          {matches.length === 0 ? <div className="px-4 py-7 text-center">
            <p className="text-sm font-semibold text-foreground">No clients match “{search.trim()}”</p>
            <p className="mt-1 text-xs text-muted-foreground">Check the spelling, or add it as a new client.</p>
            <button onClick={() => { setName(search.trim()); setSearch(""); setCreating(true); }} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90">
              <Plus size={14} /> Add “{search.trim()}” as a client
            </button>
          </div> : <ul>
            {matches.map((f, i) => <li key={`${f.name}-${i}`}>
              <Link to="/client-folder" className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 transition-colors last:border-0 hover:bg-accent/40">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-xs font-bold text-primary">{f.initials}</span>
                  <div className="min-w-0"><p className="truncate text-[15px] font-medium text-foreground">{f.name}</p><p className="text-xs text-muted-foreground">{f.count} {f.count === 1 ? "building" : "buildings"}</p></div>
                </div>
                <LivePill live={f.live} />
              </Link>
            </li>)}
          </ul>}
        </div>}
      </div>
    </section>

    {query === "" && <section className="mx-auto mt-14 max-w-xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Recent clients</h2>
        <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1 text-sm font-semibold text-link hover:underline"><Plus size={15} /> New client</button>
      </div>
      <div className="space-y-3">
        {folders.map((f, i) => <Link key={`${f.name}-${i}`} to="/client-folder" className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3.5 shadow-panel transition-colors hover:border-link/40">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-xs font-bold text-primary">{f.initials}</span>
            <div className="min-w-0"><p className="truncate text-[15px] font-medium text-foreground">{f.name}</p><p className="text-xs text-muted-foreground">{f.count} {f.count === 1 ? "building" : "buildings"}</p></div>
          </div>
          <LivePill live={f.live} />
        </Link>)}
      </div>
    </section>}

    <div className="mx-auto mt-16 flex max-w-xl flex-col items-center gap-4 border-t border-border pb-2 pt-8 sm:flex-row sm:justify-center sm:gap-10">
      <Link to="/library" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"><Building2 size={15} /> 42 buildings in your library</Link>
      <Link to="/popup" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"><Camera size={15} /> Capture building</Link>
    </div>

    {creating && <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 px-4" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setCreating(false); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="new-folder-title" className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-popup">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 text-primary"><FolderPlus size={19} /><h2 id="new-folder-title" className="text-lg font-semibold text-foreground">New client</h2></div>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setCreating(false)}><X size={17} /></Button>
        </div>
        <form onSubmit={createFolder} className="mt-6">
          <label htmlFor="folder-name" className="block text-xs font-semibold text-foreground">Client name</label>
          <input id="folder-name" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Acme BV" className="mt-2 h-11 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-link focus:ring-2 focus:ring-ring/20" />
          <p className="mt-2 text-xs text-muted-foreground">This client is a local preview in the design sandbox.</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" variant="capture" disabled={!name.trim()}><Check size={15} /> Create client</Button>
          </div>
        </form>
      </div>
    </div>}
  </SiteShell>;
}
