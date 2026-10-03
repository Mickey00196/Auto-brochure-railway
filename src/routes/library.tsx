import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Search, ArrowRight, LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteShell, PageHeading, ListingRow, type Listing } from "@/components/sandbox-site";

const listings: Listing[] = [
  { name: "The Modernist", address: "Danzigerkade 8", location: "Houthavens · Amsterdam", area: "2,450 m²", rent: "€ 295", amenities: ["Roof terrace", "Meeting rooms", "Parking"], spaces: 3, imageClass: "" },
  { name: "Harbour House", address: "Haparandadam 7", location: "Houthavens · Amsterdam", area: "1,860 m²", rent: "€ 275", amenities: ["Waterfront", "Bicycle storage"], spaces: 2, imageClass: "brochure-image--two" },
  { name: "Westhaven Works", address: "Moermanskkade 301", location: "Houthavens · Amsterdam", area: "3,120 m²", rent: "€ 310", amenities: ["EV charging", "Terrace", "Reception"], spaces: 4, imageClass: "brochure-image--three" },
  { name: "The Exchange", address: "Gustav Mahlerlaan 1025", location: "Zuidas · Amsterdam", area: "1,750 m²", rent: "€ 385", amenities: ["BREEAM", "Concierge"], spaces: 2, imageClass: "brochure-image--two" },
  { name: "Dockside One", address: "Houthavenkade 1", location: "Houthavens · Amsterdam", area: "980 m²", rent: "€ 265", amenities: ["Waterfront", "Parking"], spaces: 1, imageClass: "brochure-image--three" },
  { name: "Central Station House", address: "De Ruijterkade 5", location: "Centrum · Amsterdam", area: "2,200 m²", rent: "€ 355", amenities: ["Transit", "Meeting rooms"], spaces: 3, imageClass: "" },
];

export const Route = createFileRoute("/library")({ head: () => ({ meta: [
  { title: "Building Library — Office Shortlist" },
  { name: "description", content: "A curated library of commercial buildings ready to share with clients." },
  { property: "og:title", content: "Building Library — Office Shortlist" },
  { property: "og:description", content: "Browse and search office buildings in the Office Shortlist design sandbox." },
  { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
] }), component: LibraryPage });

function LibraryPage() {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const shown = listings.filter(b => `${b.name} ${b.address} ${b.location} ${b.amenities.join(" ")}`.toLowerCase().includes(search.toLowerCase()));
  return <SiteShell><PageHeading title="Building library" detail="Your buildings, ready for every client." action={<Button variant="capture" asChild className="h-10"><Link to="/add-building"><Plus size={16} /> Add building</Link></Button>} />
    <div className="flex flex-wrap items-center justify-between gap-3 pb-5"><div className="flex w-full min-w-0 items-center gap-2 sm:w-auto"><div className="relative min-w-0 flex-1 sm:w-80"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} aria-label="Search buildings" placeholder="Search buildings or locations" className="h-10 w-full rounded-md border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-link focus:ring-2 focus:ring-ring/20" /></div><div role="group" aria-label="Library view" className="flex shrink-0 rounded-md border border-border bg-card p-0.5"><Button type="button" variant="ghost" size="icon" title="Grid view" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")} className={`size-8 rounded-sm ${view === "grid" ? "bg-secondary text-primary" : "text-muted-foreground"}`}><LayoutGrid size={16} /></Button><Button type="button" variant="ghost" size="icon" title="List view" aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")} className={`size-8 rounded-sm ${view === "list" ? "bg-secondary text-primary" : "text-muted-foreground"}`}><List size={16} /></Button></div></div><span className="text-xs text-muted-foreground">{shown.length} of {listings.length} buildings</span></div>
    {shown.length ? view === "grid" ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{shown.map(b => <article key={b.name} className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-panel"><div className={`brochure-image ${b.imageClass} aspect-[1.45] w-full`} role="img" aria-label={`Architectural placeholder for ${b.name}`} /><div className="flex flex-1 flex-col p-5"><h2 className="text-base font-semibold text-link">{b.address}</h2><p className="mt-1 text-xs text-muted-foreground">{b.name} · {b.location}</p><p className="mt-4 text-sm font-medium text-foreground">{b.area} available <span className="mx-1 font-normal text-border">|</span> {b.rent} / m² / yr</p><div className="mt-4 flex flex-wrap gap-1.5">{b.amenities.map(a => <span key={a} className="rounded-md bg-secondary px-2 py-1 text-[11px] text-secondary-foreground">{a}</span>)}<span className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground">{b.spaces} {b.spaces === 1 ? "space" : "spaces"}</span></div><Link to="/add-building" className="mt-auto inline-flex w-fit items-center gap-1 pt-5 text-xs font-semibold text-link hover:underline">Edit <ArrowRight size={13} /></Link></div></article>)}</div> : <div className="rounded-lg border border-border bg-card px-5 sm:px-6">{shown.map(b => <ListingRow key={b.name} listing={b} action={<Link to="/add-building" className="inline-flex items-center gap-1 whitespace-nowrap pt-1 text-xs font-semibold text-link hover:underline">Edit <ArrowRight size={13} /></Link>} />)}</div> : <div className="rounded-lg border border-border bg-card py-16 text-center"><p className="font-medium text-foreground">No buildings found</p><p className="mt-2 text-sm text-muted-foreground">Try a different name or location.</p></div>}
  </SiteShell>;
}
