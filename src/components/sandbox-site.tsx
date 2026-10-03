import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowRight, Building2, FolderOpen, Users } from "lucide-react";
import type { ReactNode } from "react";

export type Listing = {
  name: string; address: string; location: string; area: string; rent: string;
  amenities: string[]; spaces: number; imageClass: string;
};

const nav = [
  { to: "/library" as const, label: "Building library", icon: Building2 },
  { to: "/clients-list" as const, label: "Clients", icon: Users },
];

export function SiteHeader() {
  const pathname = useRouterState({ select: s => s.location.pathname });
  return <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur-sm">
      <div className="mx-auto flex min-h-16 max-w-[1180px] flex-wrap items-center justify-between gap-2 px-5 py-2 sm:px-8">
        <Link to="/home" className="flex items-center gap-2.5 text-sm font-semibold text-primary"><span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground"><Building2 size={17} /></span> Office Shortlist</Link>
        <nav aria-label="Main navigation" className="flex w-full items-center gap-0.5 sm:w-auto sm:gap-1">
          {nav.map(item => <Link key={item.to} to={item.to} className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-2 text-xs font-medium transition-colors sm:gap-2 sm:px-3 ${pathname === item.to || pathname === "/client-folder" && item.to === "/clients-list" ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}><item.icon size={14} /><span>{item.label}</span></Link>)}
        </nav>
      </div>
    </header>;
}

export function SiteShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-background">
    <SiteHeader />
    <div className="mx-auto max-w-[1180px] px-5 pb-24 pt-9 sm:px-8 sm:pt-12">{children}</div>
  </div>;
}

export function PageHeading({ eyebrow, title, detail, action }: { eyebrow?: string; title: string; detail?: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 border-b border-border pb-7 sm:flex-row sm:items-end">
    <div>{eyebrow && <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-link"><FolderOpen size={13} />{eyebrow}</p>}<h1 className="text-3xl font-semibold text-foreground sm:text-4xl">{title}</h1>{detail && <p className="mt-2 text-sm text-muted-foreground">{detail}</p>}</div>
    {action && <div className="shrink-0">{action}</div>}
  </div>;
}

export function ListingRow({ listing: b, action }: { listing: Listing; action: ReactNode }) {
  return <article className="grid gap-4 border-b border-border py-5 last:border-0 sm:grid-cols-[132px_minmax(0,1fr)_auto] sm:gap-5">
    <div className={`brochure-image ${b.imageClass} aspect-[1.7] w-full overflow-hidden rounded-md sm:aspect-[1.35]`} role="img" aria-label={`Architectural placeholder for ${b.name}`} />
    <div className="min-w-0">
      <h3 className="text-base font-semibold leading-snug text-link">{b.address}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{b.name} <span aria-hidden="true">·</span> {b.location}</p>
      <p className="mt-3 text-sm font-medium text-foreground">{b.area} available <span className="mx-2 font-normal text-border">|</span> {b.rent} / m² / yr</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">{b.amenities.map(a => <span key={a} className="rounded-md bg-secondary px-2 py-1 text-[11px] text-secondary-foreground">{a}</span>)}<span className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground">{b.spaces} {b.spaces === 1 ? "space" : "spaces"}</span></div>
    </div>
    <div className="flex items-start justify-end sm:min-w-28">{action}</div>
  </article>;
}

export function SectionTitle({ title, count, action }: { title: string; count?: string; action?: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4"><div className="flex items-center gap-3"><h2 className="text-xl font-semibold text-foreground">{title}</h2>{count && <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground">{count}</span>}</div>{action}</div>;
}

export function InlineArrow() { return <ArrowRight size={14} aria-hidden="true" />; }