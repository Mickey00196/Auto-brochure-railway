import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowUpRight, Check, Copy, FileDown, Plus, QrCode, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteShell, PageHeading, SectionTitle, ListingRow, type Listing } from "@/components/sandbox-site";

const folderBuildings: Listing[] = [
  { name: "The Modernist", address: "Danzigerkade 8", location: "Houthavens · Amsterdam", area: "2,450 m²", rent: "€ 295", amenities: ["Roof terrace", "Meeting rooms", "Parking"], spaces: 3, imageClass: "" },
  { name: "Harbour House", address: "Haparandadam 7", location: "Houthavens · Amsterdam", area: "1,860 m²", rent: "€ 275", amenities: ["Waterfront", "Bicycle storage"], spaces: 2, imageClass: "brochure-image--two" },
  { name: "Westhaven Works", address: "Moermanskkade 301", location: "Houthavens · Amsterdam", area: "3,120 m²", rent: "€ 310", amenities: ["EV charging", "Terrace", "Reception"], spaces: 4, imageClass: "brochure-image--three" },
];
const extraBuildings: Listing[] = [
  { name: "The Exchange", address: "Gustav Mahlerlaan 1025", location: "Zuidas · Amsterdam", area: "1,750 m²", rent: "€ 385", amenities: ["BREEAM", "Concierge"], spaces: 2, imageClass: "brochure-image--two" },
  { name: "Dockside One", address: "Houthavenkade 1", location: "Houthavens · Amsterdam", area: "980 m²", rent: "€ 265", amenities: ["Waterfront", "Parking"], spaces: 1, imageClass: "brochure-image--three" },
];
const clientSlug = "acme-bv-amsterdam";
const liveUrl = `https://yourapp.com/s/${clientSlug}`;
// The sandbox has one brochure mock. In the product, resolve this target from clientSlug.
const liveTargetUrl = "/brochure/demo" as const;

export const Route = createFileRoute("/client-folder")({ head: () => ({ meta: [
  { title: "Acme BV — Office Shortlist" },
  { name: "description", content: "Acme BV’s client page with a live link and three Amsterdam office buildings." },
  { property: "og:title", content: "Acme BV — Office Shortlist" },
  { property: "og:description", content: "Explore Acme BV’s buildings and shareable link." },
  { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
] }), component: ClientFolderPage });

function ClientFolderPage() {
  const [buildings, setBuildings] = useState(folderBuildings);
  const [live, setLive] = useState(true);
  const [confirmingLive, setConfirmingLive] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pdfNote, setPdfNote] = useState(false);
  async function copyLink() {
    let didCopy = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(liveUrl);
        didCopy = true;
      }
    } catch { /* Fall back to the browser's selection-based copy. */ }
    if (!didCopy) {
      const input = document.createElement("textarea");
      input.value = liveUrl;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      didCopy = document.execCommand("copy");
      input.remove();
    }
    if (didCopy) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }
  return <SiteShell>
    <nav aria-label="Breadcrumb" className="mb-6 text-xs text-muted-foreground"><Link to="/clients-list" className="hover:text-link">Clients</Link><span className="mx-2">/</span> Acme BV</nav>
    <PageHeading eyebrow="Client" title="Acme BV" detail={`${buildings.length} buildings · Amsterdam Houthavens`} />
    <section aria-label="Live client link" className="overflow-hidden rounded-lg border border-border bg-card shadow-panel"><div className="h-1 bg-link" /><div className="p-5 sm:p-8"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase text-link">SHARE BUILDINGS</p><h2 className="mt-2 text-xl font-semibold text-foreground">One link, always up to date.</h2></div>{confirmingLive ? <div role="group" aria-label="Confirm live link" className="flex max-w-full flex-wrap items-center gap-2 rounded-md bg-warning-surface px-3 py-2"><p className="max-w-56 text-xs text-foreground">Buildings become visible to anyone with the link.</p><Button variant="capture" size="sm" onClick={() => { setLive(true); setConfirmingLive(false); }}>Confirm</Button><Button variant="ghost" size="sm" onClick={() => setConfirmingLive(false)}>Cancel</Button></div> : <Button variant="ghost" role="switch" aria-checked={live} aria-label="Live link status" onClick={() => { if (live) { setLive(false); setQrOpen(false); setCopied(false); } else setConfirmingLive(true); }} className={`h-9 rounded-full px-3 text-xs font-semibold ${live ? "bg-success-surface text-success hover:bg-success-surface" : "bg-secondary text-muted-foreground"}`}><span className={`size-2 rounded-full ${live ? "bg-success" : "bg-muted-foreground"}`} />{live ? "Live" : "Not shared yet"}</Button>}</div>
      <div className="mt-6 flex flex-col gap-3 rounded-md border border-border bg-subtle p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4"><span className="min-w-0 break-all font-mono text-sm font-semibold text-foreground sm:text-base">{liveUrl.replace(/^https:\/\//, "")}</span>{live && <div className="flex shrink-0 flex-wrap items-center gap-2"><Button onClick={copyLink} variant="capture" className="h-9 text-xs"><>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy link"}</></Button><Button variant="captureOutline" asChild className="h-9 text-xs"><Link to={liveTargetUrl} target="_blank" rel="noopener noreferrer">Open <ArrowUpRight size={15} /></Link></Button><Button variant="captureOutline" size="icon" onClick={() => setQrOpen(!qrOpen)} aria-label="Show QR preview" title="Show QR preview" className="size-9"><QrCode size={17} /></Button></div>}</div>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{live ? "Anyone with this link can view the buildings below — no login required." : "Turn on the link to share these buildings with anyone who has it."} <span className="font-medium">Link and controls are visual mocks in this sandbox.</span></p>
      {qrOpen && <div className="mt-4 flex items-center gap-3 border-t border-border pt-4 text-muted-foreground"><QrCode size={44} strokeWidth={1} /><p className="text-xs">QR preview only · Scannable codes would be generated in the live product.</p></div>}
    </div></section>
    <section className="mt-11"><SectionTitle title="Buildings for this client" count={`${buildings.length} buildings`} action={<Button variant="captureOutline" onClick={() => setAdding(true)} className="h-9 text-xs"><Plus size={15} /> Add from library</Button>} /><div className="mt-4 rounded-lg border border-border bg-card px-5 sm:px-6">{buildings.length ? buildings.map(b => <ListingRow key={b.name} listing={b} action={<Button variant="ghost" size="sm" title={`Remove ${b.name} from client`} aria-label={`Remove ${b.name} from client`} onClick={() => setBuildings(buildings.filter(x => x.name !== b.name))} className="text-muted-foreground hover:text-danger"><Trash2 size={14} /><span className="hidden lg:inline">Remove</span></Button>} />) : <div className="py-16 text-center text-sm text-muted-foreground">No buildings for this client yet.</div>}</div></section>
    <div className="mt-8 border-t border-border pt-6"><Button variant="ghost" onClick={() => setPdfNote(!pdfNote)} className="px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-link"><FileDown size={15} /> Download PDF instead</Button>{pdfNote && <p role="status" className="mt-2 text-xs text-muted-foreground">PDF download is not available in this visual sandbox.</p>}</div>
    {adding && <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 px-4" onMouseDown={e => { if (e.target === e.currentTarget) setAdding(false); }}><div role="dialog" aria-modal="true" aria-labelledby="add-from-library-title" className="w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-popup"><div className="flex items-start justify-between gap-3"><div><h2 id="add-from-library-title" className="text-lg font-semibold text-foreground">Add from library</h2><p className="mt-1 text-xs text-muted-foreground">Choose a building to include for Acme BV.</p></div><Button variant="ghost" size="icon" onClick={() => setAdding(false)} aria-label="Close"><X size={17} /></Button></div><div className="mt-5 divide-y divide-border border-y border-border">{extraBuildings.map(b => <div key={b.name} className="flex items-center gap-3 py-3"><div className={`brochure-image ${b.imageClass} size-12 shrink-0 rounded-md`} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-foreground">{b.name}</p><p className="truncate text-xs text-muted-foreground">{b.address}</p></div><Button variant="captureOutline" size="sm" disabled={buildings.some(x => x.name === b.name)} onClick={() => { setBuildings([...buildings, b]); setAdding(false); }}><Plus size={13} /> Add</Button></div>)}</div></div></div>}
  </SiteShell>;
}
