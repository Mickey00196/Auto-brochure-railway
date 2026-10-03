import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Copy, FolderOpen, Plus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteShell, PageHeading, InlineArrow } from "@/components/sandbox-site";

type Client = { name: string; company: string; count: number; contact?: string; slug?: string; initials: string };
const initialClients: Client[] = [
  { name: "Acme BV", company: "Acme BV", count: 3, contact: "Mara de Vries", slug: "acme-bv-amsterdam", initials: "AB" },
  { name: "Northline Partners", company: "Northline Partners", count: 3, contact: "Tom van Leeuwen", slug: "northline-amsterdam", initials: "NP" },
  { name: "Studio Noord", company: "Studio Noord B.V.", count: 2, contact: "Eva Bos", initials: "SN" },
  { name: "Meridian Group", company: "Meridian Group Europe", count: 5, initials: "MG" },
  { name: "Bureau West", company: "Bureau West", count: 1, contact: "Daan Bakker", initials: "BW" },
];

export const Route = createFileRoute("/clients-list")({ head: () => ({ meta: [
  { title: "Clients — Office Shortlist" },
  { name: "description", content: "Clients and live-link sharing states in the Office Shortlist design sandbox." },
  { property: "og:title", content: "Clients — Office Shortlist" },
  { property: "og:description", content: "Organize clients and review their live-link status." },
  { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
] }), component: ClientsPage });

function ClientsPage() {
  const [clients, setClients] = useState(initialClients);
  const [empty, setEmpty] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(slug: string) {
    const url = `https://yourapp.com/s/${slug}`;
    let didCopy = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        didCopy = true;
      }
    } catch { /* Fall back to selection-based copy. */ }
    if (!didCopy) {
      const input = document.createElement("textarea");
      input.value = url;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      didCopy = document.execCommand("copy");
      input.remove();
    }
    if (didCopy) {
      setCopied(slug);
      window.setTimeout(() => setCopied(null), 2000);
    }
  }
  function create(e: React.FormEvent) { e.preventDefault(); if (!name.trim()) return; const clean = name.trim(); setClients([{ name: clean, company: company.trim() || clean, count: 0, initials: clean.split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase() }, ...clients]); setEmpty(false); setCreating(false); setName(""); setCompany(""); }
  return <SiteShell><PageHeading title="Clients" detail="Keep buildings together for each client and share a live link when it’s ready." action={<Button variant="capture" onClick={() => setCreating(true)} className="h-10"><Plus size={16} /> New client</Button>} />
    <div className="mb-5 flex justify-end"><label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={empty} onChange={e => setEmpty(e.target.checked)} className="accent-primary" /> Preview empty state</label></div>
    {empty || !clients.length ? <div className="flex min-h-80 flex-col items-center justify-center border-y border-border text-center"><span className="flex size-12 items-center justify-center rounded-md bg-secondary text-primary"><Users size={22} /></span><h2 className="mt-5 text-xl font-semibold text-foreground">No clients yet</h2><p className="mt-2 max-w-xs text-sm text-muted-foreground">Create a client to start collecting buildings in one place.</p><Button variant="capture" onClick={() => setCreating(true)} className="mt-6"><Plus size={15} /> New client</Button></div> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{clients.map((c, i) => <Link key={`${c.name}-${i}`} to="/client-folder" aria-label={`Open ${c.name}`} className="group flex min-h-60 flex-col rounded-lg border border-border bg-card p-5 transition-colors hover:border-link/40 hover:shadow-panel"><div className="flex items-start justify-between gap-2"><div className="flex size-10 items-center justify-center rounded-md bg-secondary text-xs font-bold text-primary">{c.initials}</div><span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground">{c.count} {c.count === 1 ? "building" : "buildings"}</span></div><span className="mt-4 w-fit text-base font-semibold text-foreground group-hover:text-link">{c.name}</span><p className="mt-1 text-xs text-muted-foreground">{c.company}</p><p className="mt-2 text-xs text-muted-foreground">{c.contact ? `Contact · ${c.contact}` : "No contact set"}</p><div className="mt-auto pt-5"><div className={`flex min-h-9 items-center gap-1.5 border-t border-border pt-3 text-[11px] ${c.slug ? "text-success" : "text-muted-foreground"}`}>{c.slug ? <><span className="size-1.5 shrink-0 rounded-full bg-success" /><span className="min-w-0 truncate">Live — yourapp.com/s/{c.slug}</span><Button variant="ghost" size="icon" title="Copy live link" aria-label={`Copy live link for ${c.name}`} onClick={e => { e.preventDefault(); e.stopPropagation(); copy(c.slug ?? ""); }} className="ml-auto size-7 shrink-0 text-muted-foreground">{copied === c.slug ? <Check size={13} /> : <Copy size={13} />}</Button></> : <span>Not shared yet</span>}</div><span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-link">Open client <InlineArrow /></span></div></Link>)}</div>}
    {creating && <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 px-4" onMouseDown={e => { if (e.target === e.currentTarget) setCreating(false); }}><div role="dialog" aria-modal="true" aria-labelledby="new-client-title" className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-popup"><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-primary"><FolderOpen size={19} /><h2 id="new-client-title" className="text-lg font-semibold text-foreground">New client</h2></div><Button variant="ghost" size="icon" aria-label="Close" onClick={() => setCreating(false)}><X size={17} /></Button></div><form onSubmit={create} className="mt-6 space-y-4"><div><label htmlFor="client-name" className="text-xs font-semibold text-foreground">Client name</label><input id="client-name" autoFocus value={name} onChange={e => setName(e.target.value)} className="mt-2 h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-link" /></div><div><label htmlFor="company-name" className="text-xs font-semibold text-foreground">Company name</label><input id="company-name" value={company} onChange={e => setCompany(e.target.value)} className="mt-2 h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-link" /></div><p className="text-xs text-muted-foreground">This client is a local preview in the design sandbox.</p><div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button><Button type="submit" variant="capture" disabled={!name.trim()}>Create client</Button></div></form></div></div>}
  </SiteShell>;
}
