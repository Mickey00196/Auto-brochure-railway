import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/sandbox-site";
import {
  Check, CheckCircle2, ChevronLeft, ChevronRight,
  Images, ListOrdered, Trash2, TriangleAlert, X,
} from "lucide-react";

// ---------- mock data (route-local, no backend) ----------

const heroPhotos = [
  { n: "01", caption: "Exterior · waterfront", imageClass: "" },
  { n: "02", caption: "Entrance", imageClass: "brochure-image--two" },
  { n: "03", caption: "Lobby", imageClass: "brochure-image--three" },
  { n: "04", caption: "Floorplate", imageClass: "" },
  { n: "05", caption: "Roof terrace", imageClass: "brochure-image--three" },
];

const leaseFields: [string, string][] = [
  ["Available area approx. (m²)", "2,450"],
  ["Smallest unit (m²)", "350"],
  ["Parking ratio", "1:95"],
  ["Rental price office (€/m²/year)", "295"],
  ["Service charges (€/m²/year)", "42"],
  ["Rental price parking space (€/space/year)", ""],
  ["Available", "Q2 2027"],
];

const initialAmenities = ["Bicycle storage", "24/7 access", "Meeting rooms", "Roof terrace", "EV charging"];

type DetailField = { label: string; value: string; required?: boolean; placeholder?: string; select?: boolean };
const detailFields: DetailField[] = [
  { label: "Name", value: "", required: true, placeholder: "e.g. Danzigerkade 13-G" },
  { label: "Building type", value: "Office" },
  { label: "Address", value: "Danzigerkade 13-G", required: true },
  { label: "Postal code", value: "1013 AP" },
  { label: "City", value: "Amsterdam", required: true },
  { label: "Neighbourhood", value: "Houthavens", select: true },
  { label: "Submarket", value: "Amsterdam — Houthavens" },
  { label: "Year built", value: "2019" },
  { label: "Energy label", value: "A++" },
  { label: "BREEAM rating", value: "Excellent" },
  { label: "Total building area (m²)", value: "8,200" },
];

const duplicates = [
  { name: "The Modernist", address: "Danzigerkade 8, Amsterdam", spaces: "3 spaces", imageClass: "brochure-image--two" },
  { name: "Harbour House", address: "Haparandadam 7, Amsterdam", spaces: "Draft — no spaces yet", imageClass: "brochure-image--three" },
];

const sections = [
  { id: "photos", n: "01", label: "Photos", meta: "14 captured" },
  { id: "lease-terms", n: "02", label: "Lease terms", meta: "7 fields" },
  { id: "building", n: "03", label: "Building", meta: "1 check" },
  { id: "accessibility", n: "04", label: "Accessibility", meta: "3 rows" },
];

// ---------- shared field pieces ----------

const inputClass = "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-link focus:ring-2 focus:ring-link/15";

function Field({ label, value, required, placeholder, select }: DetailField) {
  return <div>
    <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
      {label}{required && <span className="ml-0.5 text-danger">*</span>}
    </label>
    {select
      ? <div className="relative">
          <select defaultValue={value} className={`${inputClass} appearance-none pr-8`}>
            {["Houthavens", "Zuidas", "Sloterdijk", "De Pijp", "Oostelijk Havengebied"].map(o => <option key={o}>{o}</option>)}
          </select>
          <ChevronRight className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 rotate-90 text-muted-foreground" />
        </div>
      : <input defaultValue={value} placeholder={placeholder} className={inputClass} />}
  </div>;
}

function Card({ id, title, badge, badgeTone, eyebrow, helper, children }: {
  id: string; title: React.ReactNode; badge?: string; badgeTone?: "neutral" | "success";
  eyebrow?: string; helper?: string; children: React.ReactNode;
}) {
  return <section id={id} className="scroll-mt-10 rounded-2xl border border-border bg-card p-6 shadow-panel sm:p-8">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        {eyebrow && <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-link">{eyebrow}</p>}
        <h2 className="text-[22px] font-semibold leading-tight text-foreground">{title}</h2>
      </div>
      {badge && <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${badgeTone === "success" ? "bg-success-surface text-success" : "bg-secondary text-secondary-foreground"}`}>{badge}</span>}
    </div>
    {helper && <p className="mt-2 max-w-2xl text-[12px] leading-[1.6] text-muted-foreground">{helper}</p>}
    <div className="mt-6">{children}</div>
  </section>;
}

function PhotoBlock({ photo, className }: { photo: (typeof heroPhotos)[number]; className?: string }) {
  return <div className={`brochure-image ${photo.imageClass} relative min-w-0 overflow-hidden ${className}`} role="img" aria-label={`Placeholder photo ${photo.n} — ${photo.caption}`}>
    <span className="absolute bottom-2.5 left-2.5 z-10 rounded-md bg-card/90 px-2 py-1 text-[10px] font-medium text-muted-foreground">{photo.n} · {photo.caption}</span>
  </div>;
}

// ---------- page ----------

export const Route = createFileRoute("/add-building")({
  head: () => ({ meta: [
    { title: "Add Building Form — Office Shortlist" },
    { name: "description", content: "A redesigned intake form for adding a captured office building to the library: photos, lease terms, building details and accessibility." },
    { property: "og:title", content: "Add Building Form — Office Shortlist" },
    { property: "og:description", content: "A redesigned intake form for adding a captured office building to the library." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AddBuildingPage,
});

function AddBuildingPage() {
  const [hero, setHero] = useState(0);
  const [amenities, setAmenities] = useState(initialAmenities);
  const current = heroPhotos[hero] ?? heroPhotos[0]!;
  const thumbs = heroPhotos.filter((_, i) => i !== hero).slice(0, 4);

  return <main className="min-h-screen">
    <SiteHeader />
    <div className="px-4 pb-20 pt-8 sm:px-8 sm:pt-12">
    <div className="mx-auto max-w-[1100px]">
      <header className="flex flex-col justify-between gap-5 border-b border-border pb-8 sm:flex-row sm:items-end">
        <div>
          <div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.13em] text-link"><span className="size-2 rounded-sm bg-link" />Building library <span className="text-muted-foreground">/ New building</span></div>
          <h1 className="text-3xl font-semibold text-foreground sm:text-4xl">Add Building</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">The intake form a broker fills in after a capture — shown here with the executive summary pre-filled from the Chrome extension.</p>
        </div>
        <Link to="/library" className="shrink-0 text-[12px] font-semibold text-link hover:underline">Back to building library</Link>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-12">
        {/* sticky section rail */}
        <aside className="hidden lg:block">
          <div className="sticky top-8">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Sections</p>
            <nav aria-label="Form sections" className="mt-3 space-y-1">
              {sections.map((s, i) => <a key={s.id} href={`#${s.id}`} className={`flex items-baseline gap-2.5 rounded-lg px-3 py-2 text-[12px] transition-colors ${i === 0 ? "bg-secondary font-semibold text-primary" : "font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground"}`}>
                <span className={`text-[10px] font-semibold ${i === 0 ? "text-link" : "text-muted-foreground/60"}`}>{s.n}</span>
                <span className="flex-1">{s.label}</span>
                <span className="text-[10px] text-muted-foreground/70">{s.meta}</span>
              </a>)}
            </nav>
            <div className="mt-6 border-t border-border pt-5">
              <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground"><span>Reviewed</span><span className="font-semibold text-foreground">1 / 4</span></div>
              <div className="mt-2 h-1 rounded-full bg-secondary"><div className="h-1 w-1/4 rounded-full bg-link" /></div>
              <p className="mt-5 text-[11px] leading-relaxed text-muted-foreground">Duplicates are checked automatically as the address is typed.</p>
            </div>
          </div>
        </aside>

        {/* the form */}
        <form className="min-w-0 space-y-6" onSubmit={e => e.preventDefault()}>

          {/* Card 1 — Photos */}
          <Card id="photos" title="Photos" badge="14">
            <p className="text-[12px] leading-[1.6] text-muted-foreground">14 photos captured — duplicates from lazy-loading removed automatically.</p>
            <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
              <div className={`brochure-image ${current.imageClass} relative h-[300px] min-w-0 overflow-hidden lg:h-[440px]`} role="img" aria-label={`Placeholder photo ${current.n} — ${current.caption}`}>
                <span className="absolute bottom-3 left-3 z-10 inline-flex items-center gap-1.5 rounded-md bg-primary/90 px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground backdrop-blur-sm"><Images size={12} /> 14 photos</span>
                <span className="absolute bottom-3 right-3 z-10 rounded-md bg-card/90 px-2 py-1 text-[10px] font-medium text-muted-foreground">{current.n} · {current.caption}</span>
                <div className="absolute right-3 top-3 z-10 flex gap-2">
                  <button type="button" className="inline-flex items-center gap-1.5 rounded-md bg-primary/90 px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground backdrop-blur-sm transition-colors hover:bg-primary"><ListOrdered size={12} /> Reorder</button>
                  <button type="button" className="inline-flex items-center gap-1.5 rounded-md bg-primary/90 px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground backdrop-blur-sm transition-colors hover:bg-primary"><Trash2 size={12} /> Remove all</button>
                </div>
              </div>
              <div className="grid grid-cols-2 grid-rows-2 gap-3">
                {thumbs.map(p => <button key={p.n} type="button" onClick={() => setHero(heroPhotos.indexOf(p))} className="group relative text-left" aria-label={`Show photo ${p.n} as hero`}>
                  <PhotoBlock photo={p} className="h-[144px] w-full lg:h-[214px] transition-opacity group-hover:opacity-85" />
                </button>)}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-center gap-3">
              <button type="button" onClick={() => setHero((hero + heroPhotos.length - 1) % heroPhotos.length)} aria-label="Previous photo" className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-secondary"><ChevronLeft size={17} /></button>
              <span className="text-[11px] font-medium text-muted-foreground">Photo {current.n} of 14</span>
              <button type="button" onClick={() => setHero((hero + 1) % heroPhotos.length)} aria-label="Next photo" className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-secondary"><ChevronRight size={17} /></button>
            </div>
          </Card>

          {/* Card 2 — Executive summary / lease terms */}
          <Card id="lease-terms" title="Danzigerkade 13-G" eyebrow="Executive summary · Lease terms" badge="Pre-filled by capture" badgeTone="success"
            helper="Filled in by the Chrome extension where the listing states them. Saving creates the building's available space with these terms — leave empty to add spaces by hand later instead.">
            <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
              {leaseFields.map(([label, value]) => <div key={label}>
                <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">{label}</label>
                <input defaultValue={value} placeholder="Not stated" className={inputClass} />
              </div>)}
            </div>

            <div className="mt-7 border-t border-border pt-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-link">Amenities</p>
                <p className="text-[11px] text-muted-foreground">Shown on the client brochure as tagged</p>
              </div>
              <div className="mt-3.5 flex flex-wrap items-center gap-2">
                {amenities.map(a => <span key={a} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground">
                  {a}
                  <button type="button" onClick={() => setAmenities(amenities.filter(x => x !== a))} aria-label={`Remove ${a}`} className="text-muted-foreground transition-colors hover:text-danger"><X size={12} /></button>
                </span>)}
                <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:border-link hover:text-link">
                  + Add amenity
                </button>
              </div>
            </div>
          </Card>

          {/* Card 3 — Building */}
          <Card id="building" title="Building">
            <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
              {detailFields.map(f => <Field key={f.label} {...f} />)}
            </div>

            {/* duplicate detection — warm and helpful, not alarming */}
            <div className="mt-7 rounded-xl border border-warning/30 bg-warning-surface p-4 sm:p-5">
              <div className="flex items-start gap-2.5">
                <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warning" />
                <p className="text-[13px] font-semibold leading-snug text-foreground">This looks similar to 2 buildings already in the library:</p>
              </div>
              <div className="mt-3 space-y-2 pl-0 sm:pl-7">
                {duplicates.map(d => <div key={d.name} className="flex items-center gap-3 rounded-lg border border-warning/25 bg-card p-2.5">
                  <div className={`brochure-image ${d.imageClass} size-11 shrink-0 rounded-md`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-foreground">{d.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{d.address} · {d.spaces}</div>
                  </div>
                  <a href="#building" className="shrink-0 text-[11px] font-semibold text-link hover:underline">View / Edit instead →</a>
                </div>)}
              </div>
              <div className="mt-3 pl-0 sm:pl-7">
                <button type="button" className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground">
                  <X size={12} /> Not a duplicate — this is a different building
                </button>
              </div>
            </div>
          </Card>

          {/* Card 4 — Accessibility */}
          <Card id="accessibility" title="Accessibility" helper="Auto-filled once the address is confirmed — edit any field to override.">
            <div className="space-y-5">
              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-link">Highway access</label>
                <input defaultValue="A10 · 3 km" className={inputClass} />
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-link">Airport access</label>
                <input defaultValue="Schiphol · 15 km" className={inputClass} />
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-link">Public transport</label>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
                  <input defaultValue="Bus 22 · 4 min walk" className={inputClass} />
                  <div className="relative">
                    <select defaultValue="Nearest" className={`${inputClass} appearance-none pr-8`} aria-label="Transport mode">
                      {["Nearest", "Train", "Metro", "Tram", "Bus"].map(o => <option key={o}>{o}</option>)}
                    </select>
                    <ChevronRight className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 rotate-90 text-muted-foreground" />
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button type="button" className="inline-flex h-9 items-center rounded-full border border-border px-4 text-[12px] font-semibold text-foreground transition-colors hover:bg-secondary">Look up distances</button>
              <p className="inline-flex items-center gap-1.5 text-[12px] font-medium text-link"><CheckCircle2 size={14} /> Filled in highway, airport — straight-line distances, check them over.</p>
            </div>
          </Card>

          {/* actions */}
          <div className="pt-2">
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-navy-soft">
                <Check size={16} /> Save to library
              </button>
              <button type="button" className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-secondary">Discard</button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">Saved permanently in your library — reusable for any client, and never overwritten by a later capture.</p>
          </div>
        </form>
      </div>
    </div>
    </div>
  </main>;
}
