import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowRight, Building2, Check, ChevronRight, MapPin } from "lucide-react";
import { SiteHeader } from "@/components/sandbox-site";

type Building = {
  id: string; number: string; name: string; address: string; neighborhood: string;
  available: string; rent: string; service: string; energy: string; availability: string;
  amenities: string[]; description: string; highway: string; airport: string; transit: string;
  imageClass: string;
};
const buildings: Building[] = [
  { id: "the-modernist", number: "01", name: "The Modernist", address: "Danzigerkade 8, 1013 AP Amsterdam", neighborhood: "Houthavens · Amsterdam", available: "2,450 m²", rent: "€ 295", service: "€ 42", energy: "A++", availability: "Q2 2027", amenities: ["Roof terrace", "Meeting facilities", "Bicycle storage", "On-site parking", "Reception"], description: "A considered workplace on the waterfront, with bright floorplates and a direct connection to Amsterdam’s creative west. Flexible space and shared amenities make it an assured choice for a growing team.", highway: "A10 · 3 km", airport: "Schiphol · 15 km", transit: "Bus 22 · 4 min walk", imageClass: "" },
  { id: "harbour-house", number: "02", name: "Harbour House", address: "Haparandadam 7, 1013 AK Amsterdam", neighborhood: "Houthavens · Amsterdam", available: "1,860 m²", rent: "€ 275", service: "€ 38", energy: "A+", availability: "Immediately", amenities: ["Waterfront setting", "Flexible floorplates", "Showers", "Bicycle storage", "Café nearby"], description: "A quieter position along the harbour, balanced by excellent access to the city. Generous glazing and adaptable floors offer a practical canvas for a team that values clarity, daylight and room to evolve.", highway: "A10 · 4 km", airport: "Schiphol · 17 km", transit: "Bus 48 · 5 min walk", imageClass: "brochure-image--two" },
  { id: "westhaven-works", number: "03", name: "Westhaven Works", address: "Moermanskkade 301, 1013 BC Amsterdam", neighborhood: "Houthavens · Amsterdam", available: "3,120 m²", rent: "€ 310", service: "€ 45", energy: "A+++", availability: "Q4 2026", amenities: ["Private terraces", "EV charging", "Meeting facilities", "Bicycle storage", "Reception"], description: "Contemporary office space with a strong architectural identity and the capacity to bring multiple teams together. Well-served by road and transit, the building combines everyday convenience with a distinctive waterfront address.", highway: "A10 · 3 km", airport: "Schiphol · 16 km", transit: "Bus 22 · 6 min walk", imageClass: "brochure-image--three" },
];

export const Route = createFileRoute("/brochure/demo")({
  head: () => ({ meta: [
    { title: "Amsterdam Houthavens Shortlist — Office Shortlist" },
    { name: "description", content: "An interactive commercial office shortlist: three Amsterdam Houthavens buildings presented in a shareable digital brochure." },
    { property: "og:title", content: "Amsterdam Houthavens Shortlist — Office Shortlist" },
    { property: "og:description", content: "Explore three Amsterdam Houthavens office opportunities in a digital brochure." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: BrochurePage,
});

function BrochurePage() {
  return <main className="bg-background">
    <SiteHeader />
    <div className="sticky top-16 z-20 border-b border-border bg-card/95 backdrop-blur-sm max-sm:top-[104px]">
      <div className="mx-auto flex min-h-11 max-w-[1180px] items-center gap-2 px-5 sm:px-8">
        <a href="#top" className="shrink-0 text-[11px] font-semibold text-foreground hover:text-link">Acme BV <span className="text-muted-foreground">/</span> Shortlist</a>
        <nav aria-label="Building contents" className="ml-auto flex min-w-0 items-center gap-1 overflow-x-auto sm:gap-2">
          {buildings.map(b => <a key={b.id} href={`#${b.id}`} className="shrink-0 rounded-lg px-2 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-primary sm:px-3 sm:text-xs"><span className="mr-1 text-link">{b.number}</span><span className="hidden md:inline">{b.name}</span><span className="md:hidden">{b.name.split(" ")[0]}</span></a>)}
        </nav>
      </div>
    </div>

    <section id="top" className="relative overflow-hidden bg-primary text-primary-foreground">
      <div className="mx-auto grid min-h-[600px] max-w-[1440px] items-center gap-10 px-5 py-16 sm:px-10 lg:min-h-[680px] lg:grid-cols-[1fr_0.85fr] lg:px-16 lg:py-24">
        <div className="relative z-10 max-w-[650px]">
          <p className="mb-8 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-foreground/65">Office shortlist <span className="mx-3">/</span> Amsterdam</p>
          <h1 className="max-w-[620px] text-5xl font-medium leading-[1.05] sm:text-6xl lg:text-[76px]">Amsterdam<br />Houthavens</h1>
          <p className="mt-7 max-w-md text-base leading-relaxed text-primary-foreground/75 sm:text-lg">Three considered places for your next chapter in the city.</p>
          <div className="mt-14 grid max-w-[480px] grid-cols-2 gap-x-8 gap-y-5 border-t border-primary-foreground/25 pt-6 text-sm sm:grid-cols-3">
            <div><div className="text-[10px] uppercase tracking-[0.13em] text-primary-foreground/55">Prepared for</div><div className="mt-1 font-medium">Acme BV</div></div>
            <div><div className="text-[10px] uppercase tracking-[0.13em] text-primary-foreground/55">Prepared by</div><div className="mt-1 font-medium">Sophie van Dijk</div></div>
            <div><div className="text-[10px] uppercase tracking-[0.13em] text-primary-foreground/55">Date</div><div className="mt-1 font-medium">1 October 2026</div></div>
          </div>
          <a href="#the-modernist" className="mt-12 inline-flex items-center gap-2 text-xs font-semibold text-primary-foreground hover:underline">Explore the shortlist <ArrowDown size={15} /></a>
        </div>
        <div className="relative hidden min-h-[460px] self-stretch lg:block" aria-hidden="true">
          <div className="brochure-image absolute inset-x-[5%] top-[5%] h-[80%] rotate-[-3deg] rounded-sm opacity-90" />
          <div className="brochure-image brochure-image--two absolute bottom-0 right-0 h-[55%] w-[63%] rotate-[4deg] rounded-sm border-[8px] border-cover shadow-popup" />
          <div className="absolute bottom-10 left-2 border-l border-primary-foreground/40 pl-4 text-xs uppercase tracking-[0.14em] text-primary-foreground/70">03 buildings<br />01 neighbourhood</div>
        </div>
      </div>
    </section>

    <section className="border-b border-border bg-card px-5 py-12 sm:px-10 lg:px-16">
      <div className="mx-auto grid max-w-[1312px] gap-8 lg:grid-cols-[260px_1fr] lg:gap-14">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-link">The selection</p><h2 className="mt-3 text-2xl font-semibold text-foreground">At a glance</h2></div>
        <div className="grid gap-0 sm:grid-cols-3">{buildings.map(b => <a key={b.id} href={`#${b.id}`} className="group flex items-start gap-4 border-t border-border py-5 sm:border-l sm:border-t-0 sm:px-6 sm:py-1 first:sm:border-l-0 first:sm:pl-0"><span className="text-xs font-semibold text-link">{b.number}</span><div className="min-w-0"><div className="text-sm font-semibold text-foreground group-hover:text-link">{b.name}</div><div className="mt-1 text-xs text-muted-foreground">{b.available} available</div></div><ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" /></a>)}</div>
      </div>
    </section>

    {buildings.map((b, i) => <BuildingSection key={b.id} building={b} index={i} />)}
    <footer className="bg-primary px-5 py-12 text-primary-foreground sm:px-10 lg:px-16"><div className="mx-auto flex max-w-[1312px] flex-col justify-between gap-6 sm:flex-row sm:items-end"><div><div className="flex items-center gap-2 text-sm font-semibold"><Building2 size={17} /> Office Shortlist</div><p className="mt-4 max-w-sm text-xs leading-relaxed text-primary-foreground/60">A focused view of your next office. Details shown are illustrative for this design concept.</p></div><a href="#top" className="inline-flex items-center gap-2 text-xs font-medium hover:underline">Back to top <ArrowRight className="size-4 -rotate-90" /></a></div></footer>
  </main>;
}

function BuildingSection({ building: b, index }: { building: Building; index: number }) {
  const next = buildings[index + 1];
  return <section id={b.id} className={`scroll-mt-32 border-b border-border ${index % 2 === 0 ? "bg-background" : "bg-card"}`}>
    <div className="mx-auto max-w-[1440px] px-5 py-14 sm:px-10 sm:py-20 lg:px-16 lg:py-24">
      <div className="mb-8 flex items-center justify-between border-b border-border pb-4 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground"><span>Property {b.number} / 03</span><span>Amsterdam Houthavens</span></div>
      <div className="mb-9 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="flex items-center gap-1.5 text-xs font-medium text-link"><MapPin size={13} />{b.neighborhood}</p><h2 className="mt-3 text-4xl font-semibold leading-tight text-foreground sm:text-5xl lg:text-6xl">{b.name}</h2><p className="mt-3 text-sm text-muted-foreground">{b.address}</p></div><div className="w-fit rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-foreground">{b.energy} energy label</div></div>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,0.8fr)]">
        <div className={`brochure-image ${b.imageClass} relative aspect-[1.55] min-w-0 rounded-xl lg:aspect-auto lg:min-h-[510px]`} role="img" aria-label={`Abstract architectural placeholder for ${b.name}`}><span className="absolute bottom-5 left-5 z-10 rounded-md bg-card/90 px-3 py-1.5 text-[10px] font-medium text-muted-foreground">Image placeholder / Exterior view</span></div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-1"><div className={`brochure-image ${b.imageClass} relative aspect-[1.4] rounded-xl lg:aspect-auto`} role="img" aria-label={`Abstract detail placeholder for ${b.name}`}><span className="absolute bottom-3 left-3 z-10 rounded-md bg-card/90 px-2 py-1 text-[10px] font-medium text-muted-foreground">Detail / 01</span></div><div className={`brochure-image ${b.imageClass} relative aspect-[1.4] rounded-xl lg:aspect-auto`} role="img" aria-label={`Abstract interior placeholder for ${b.name}`}><span className="absolute bottom-3 left-3 z-10 rounded-md bg-card/90 px-2 py-1 text-[10px] font-medium text-muted-foreground">Interior / 02</span></div></div>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-y-6 border-y border-border py-7 sm:grid-cols-3 lg:grid-cols-5">
        {[ ["Available area", b.available], ["Rent / m² / yr", b.rent], ["Service / m² / yr", b.service], ["Energy label", b.energy], ["Availability", b.availability] ].map(([label, value]) => <div key={label} className="border-l border-border pl-4 first:border-l-0 first:pl-0 sm:pl-6 lg:pl-8"><div className="text-[10px] font-medium uppercase tracking-[0.09em] text-muted-foreground">{label}</div><div className="mt-2 text-xl font-semibold text-foreground sm:text-2xl">{value}</div></div>)}
      </div>
      <div className="mt-12 grid gap-10 lg:grid-cols-[1.25fr_0.75fr] lg:gap-24">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-link">The opportunity</p><p className="mt-5 max-w-[700px] text-lg leading-[1.7] text-foreground sm:text-xl">{b.description}</p><div className="mt-7 flex flex-wrap gap-2">{b.amenities.map(a => <span key={a} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-foreground"><Check className="size-3 text-link" />{a}</span>)}</div></div>
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-link">Connections</p><div className="mt-4 divide-y divide-border border-t border-b border-border">{[["Highway", b.highway], ["Airport", b.airport], ["Public transport", b.transit]].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 py-4 text-sm"><span className="text-muted-foreground">{label}</span><span className="text-right font-semibold text-foreground">{value}</span></div>)}</div></div>
      </div>
      <div className="mt-20 flex justify-end border-t border-border pt-6">{next ? <a href={`#${next.id}`} className="group inline-flex items-center gap-3 text-xs font-semibold text-link">Next property <span className="text-foreground">{next.name}</span><ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></a> : <a href="#top" className="inline-flex items-center gap-2 text-xs font-semibold text-link">Return to cover <ArrowRight className="size-4 -rotate-90" /></a>}</div>
    </div>
  </section>;
}
