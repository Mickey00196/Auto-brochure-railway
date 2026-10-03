import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Building2, Check, ChevronDown, ExternalLink, LoaderCircle, Settings2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/sandbox-site";

type CaptureState = "idle" | "loading" | "ready" | "warning" | "error";
type Direction = "compact" | "editorial" | "structured";

const rows = [
  ["Name", "The Modernist"], ["Address", "Danzigerkade 8"], ["City", "Amsterdam"],
  ["Subarea", "Houthavens"], ["Available m²", "2,450"], ["Min. unit m²", "350"],
  ["Total building m²", "8,200"], ["Amenities", "Meeting rooms, roof terrace"],
  ["Parking ratio", "1:95"], ["Rent €/m²/yr", "€ 295"],
  ["Service €/m²/yr", "€ 42"], ["Parking €/yr", "—"],
  ["Available", "Q2 2027"], ["Energy", "A++"], ["Year built", "2019"],
  ["Airport", "Schiphol 15 km"], ["Highway", "A10 3 km"],
  ["Public transport", "Bus 22 · 4 min walk"], ["Photos", "14 (page says 20)"],
] as const;
const stateLabels: Record<CaptureState, string> = { idle: "Idle", loading: "Loading", ready: "Ready", warning: "Warning", error: "Error" };
const directions: { key: Direction; number: string; name: string; note: string; initial: CaptureState }[] = [
  { key: "compact", number: "01", name: "Compact utility", note: "High information density, quick to scan.", initial: "ready" },
  { key: "editorial", number: "02", name: "Calm editorial", note: "More breathing room around every detail.", initial: "idle" },
  { key: "structured", number: "03", name: "Sectioned report", note: "Grouped fields for an orderly handoff.", initial: "warning" },
];

export const Route = createFileRoute("/popup")({
  head: () => ({ meta: [
    { title: "Listing Capture Concepts — Office Shortlist" },
    { name: "description", content: "Three visual directions for the Office Shortlist browser-extension listing capture popup." },
    { property: "og:title", content: "Listing Capture Concepts — Office Shortlist" },
    { property: "og:description", content: "Three visual directions for a commercial real estate listing capture popup." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: PopupPage,
});

function CapturePopup({ direction, initial }: { direction: Direction; initial: CaptureState }) {
  const [state, setState] = useState<CaptureState>(initial);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  function selectState(next: CaptureState) {
    if (timer.current) clearTimeout(timer.current);
    setState(next);
  }
  function capture() {
    selectState("loading");
    timer.current = setTimeout(() => setState("ready"), 1200);
  }
  const compact = direction === "compact";
  const editorial = direction === "editorial";
  const isPreview = state === "ready" || state === "warning";
  const status = state === "ready" ? "Ready in 180 ms — 14 photos. Click to send it to your library."
    : state === "warning" ? "8 of 20 photos on this page. Open ‘Alle media’ on the listing, then reopen this popup to pick up the rest."
    : state === "error" ? "This looks like a verification page — open the real listing, then reopen this popup."
    : state === "loading" ? "Reading this page…" : null;
  return <div className="w-[340px] shrink-0">
    <div className="mb-3 flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1 shadow-panel" aria-label="Preview capture state">
      {(Object.keys(stateLabels) as CaptureState[]).map(item =>
        <Button key={item} size="sm" variant={state === item ? "capture" : "ghost"} onClick={() => selectState(item)} className="h-7 flex-1 rounded-lg px-1 text-[10px] font-semibold">{stateLabels[item]}</Button>
      )}
    </div>
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-popup">
      <div className={`bg-primary text-primary-foreground ${editorial ? "px-6 py-6" : "px-5 py-4"}`}>
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-foreground/10 ring-1 ring-primary-foreground/20"><Building2 size={17} strokeWidth={1.8} /></div>
          <div><div className="text-[10px] font-medium uppercase tracking-[0.13em] text-primary-foreground/60">Office Shortlist</div><h3 className="text-[15px] font-semibold leading-tight">Listing Capture</h3></div>
        </div>
      </div>
      <div className={editorial ? "p-6" : "p-5"}>
        <p className="text-[12px] leading-[1.6] text-muted-foreground">Open a listing you're viewing, then capture it. Reads the open page only.</p>
        <Button variant="capture" onClick={capture} disabled={state === "loading"} className="mt-4 h-10 w-full text-[12px] font-semibold shadow-sm">
          {state === "loading" ? <><LoaderCircle className="animate-spin" /> Reading this page…</> : <><Sparkles size={15} /> Capture this listing</>}
        </Button>
        {status && <div role="status" className={`mt-4 flex gap-2.5 rounded-xl px-3 py-3 text-[11px] font-medium leading-[1.55] ${state === "ready" ? "bg-success-surface text-success" : state === "warning" ? "bg-warning-surface text-warning" : state === "error" ? "bg-danger-surface text-danger" : "bg-secondary text-muted-foreground"}`}>
          <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-current" />{status}
        </div>}
        {isPreview && <div className={`mt-5 ${editorial ? "space-y-4" : "space-y-3"}`}>
          <div className="flex items-center justify-between"><div><div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Extracted listing</div>{editorial && <p className="mt-1 text-[12px] font-semibold text-foreground">The Modernist</p>}</div><span className="rounded-full bg-secondary px-2 py-1 text-[10px] font-semibold text-secondary-foreground">19 fields</span></div>
          {direction === "structured" ? <div className="overflow-hidden rounded-xl border border-border">
            {[["Property", 0, 4], ["Space & costs", 4, 13], ["Location & media", 13, 19]].map(([title, start, end]) => <div key={title}>
              <div className="border-t border-border bg-secondary px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-secondary-foreground first:border-t-0">{title}</div>
              <div className="px-3">{rows.slice(Number(start), Number(end)).map(([label, value]) => <FieldRow key={label} label={label} value={label === "Photos" && state === "warning" ? "8 (page says 20)" : value} compact />)}</div>
            </div>)}
          </div> : <div className={compact ? "overflow-hidden rounded-xl border border-border bg-subtle px-3" : "border-t border-border"}>
            {rows.map(([label, value]) => <FieldRow key={label} label={label} value={label === "Photos" && state === "warning" ? "8 (page says 20)" : value} compact={compact} />)}
          </div>}
          <Button variant="capture" className="h-10 w-full text-[12px] font-semibold">Send to library <ArrowRight size={14} /></Button>
        </div>}
      </div>
      <div className="border-t border-border bg-subtle px-5 py-1">
        <Button variant="ghost" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)} className="h-11 w-full justify-between px-0 text-[12px] font-semibold text-foreground hover:bg-transparent">
          <span className="flex items-center gap-2"><Settings2 size={14} className="text-muted-foreground" />Settings</span><ChevronDown size={15} className={`text-muted-foreground transition-transform ${settingsOpen ? "rotate-180" : ""}`} />
        </Button>
        {settingsOpen && <div className="pb-4 pt-1">
          <label htmlFor={`address-${direction}`} className="mb-2 block text-[11px] font-semibold text-foreground">Your Proposal Engine address</label>
          <input id={`address-${direction}`} value={address} onChange={e => { setAddress(e.target.value); setSaved(false); }} placeholder="https://proposal.example.com" className="h-9 w-full rounded-lg border border-input bg-card px-3 text-[11px] text-foreground outline-none placeholder:text-muted-foreground focus:border-link focus:ring-2 focus:ring-link/15" />
          <Button variant="captureOutline" size="sm" onClick={() => setSaved(true)} className="mt-3 h-8 text-[11px]">{saved ? <><Check size={13} /> Saved for preview</> : "Save address"}</Button>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">Used when sending a captured listing to your building library.</p>
        </div>}
      </div>
    </div>
  </div>;
}

function FieldRow({ label, value, compact }: { label: string; value: string; compact?: boolean }) {
  return <div className={`grid grid-cols-[43%_1fr] gap-2 border-b border-border/75 last:border-0 ${compact ? "py-[7px]" : "py-[10px]"}`}>
    <span className="text-[10px] leading-[1.35] text-muted-foreground">{label}</span><span className={`text-right text-[10px] font-medium leading-[1.35] ${value === "—" ? "text-muted-foreground/60" : "text-foreground"}`}>{value}</span>
  </div>;
}

function PopupPage() {
  return <main className="min-h-screen">
    <SiteHeader />
    <div className="px-4 pb-20 pt-8 sm:px-8 sm:pt-12">
    <div className="mx-auto max-w-[1120px]">
      <header className="flex flex-col justify-between gap-5 border-b border-border pb-8 sm:flex-row sm:items-end">
        <div><div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.13em] text-link"><span className="size-2 rounded-sm bg-link" />Building library <span className="text-muted-foreground">/ Capture</span></div><h1 className="text-3xl font-semibold text-foreground sm:text-4xl">Listing Capture</h1><p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">Three directions for the browser extension. Each preview is shown at its actual 340px width.</p></div>
        <Link to="/library" className="inline-flex items-center gap-2 text-[12px] font-semibold text-link hover:underline">Back to building library <ExternalLink size={14} /></Link>
      </header>
      <div className="mt-9 grid gap-12 lg:grid-cols-3 lg:gap-8">
        {directions.map(d => <section key={d.key} className="flex min-w-0 flex-col items-center lg:items-start">
          <div className="mb-5 w-[340px] max-w-full"><div className="flex items-center gap-3"><span className="text-[11px] font-semibold text-link">{d.number} /</span><h2 className="text-lg font-semibold text-foreground">{d.name}</h2></div><p className="mt-1 text-[12px] text-muted-foreground">{d.note}</p></div>
          <CapturePopup direction={d.key} initial={d.initial} />
        </section>)}
      </div>
    </div>
    </div>
  </main>;
}
