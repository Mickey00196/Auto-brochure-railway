"use client";

import {
  ArrowDown,
  ArrowRight,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Images,
  MapPin,
  Printer,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { PublicBuilding, PublicClient, Unit } from "@/lib/types";
import { formatArea } from "@/lib/format";
import type { MapBuilding } from "./ShortlistMap";

const ShortlistMap = dynamic(() => import("./ShortlistMap"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-muted">Loading map…</div>,
});

type Brochure = {
  id: string;
  number: string;
  name: string;
  address: string;
  neighborhood: string;
  city: string;
  available: string;
  divisibleFrom: string;
  rent: string;
  service: string;
  delivery: string;
  energy: string;
  availability: string;
  parking: string;
  amenities: string[];
  description: string;
  highway: string;
  airport: string;
  transit: string;
  imageClass: string;
  photos: string[];
  floorplans: string[];
  lat: number | null;
  lng: number | null;
  geocodeQuery: string;
};

const imageClasses = ["", "brochure-image--two", "brochure-image--three"];
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const isFloorplan = (url: string) => /plattegrond|floorplan/i.test(url);

const deliveryLabels: Record<string, string> = {
  turn_key: "Turn-key",
  shell_and_core: "Shell & core",
  shell_and_core_plus: "Shell & core+",
  mixed: "Mixed",
};

function range(values: number[]): string {
  if (values.length === 0) return "On request";
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? `€${fmt(min)}` : `€${fmt(min)}–€${fmt(max)}`;
}

function toBrochure(b: PublicBuilding, i: number): Brochure {
  const units: Unit[] = b.units ?? [];
  const photos = b.photos ?? [];
  const totalAvailable = units.reduce((sum, u) => sum + (u.available_area_m2 ?? 0), 0);
  const divisible = units.map((u) => u.min_divisible_area_m2).filter((v): v is number => typeof v === "number");
  const unitFloorplans = units.map((u) => u.floorplan_url).filter((v): v is string => Boolean(v));
  const delivery = units.find((u) => u.delivery_condition)?.delivery_condition ?? null;
  return {
    id: `b-${b.building_id}`,
    number: pad(i + 1),
    name: b.name,
    address: [b.address, [b.postal_code, b.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    neighborhood: [b.submarket, b.city].filter(Boolean).join(" · "),
    city: b.city || "",
    available: totalAvailable > 0 ? formatArea(totalAvailable) : "On request",
    divisibleFrom: divisible.length ? `${fmt(Math.min(...divisible))} m²` : "—",
    rent: range(units.map((u) => u.rent_eur_per_m2_year).filter((v): v is number => typeof v === "number")),
    service: range(
      units.map((u) => u.service_charge_eur_per_m2_year).filter((v): v is number => typeof v === "number"),
    ),
    delivery: delivery ? deliveryLabels[delivery] ?? delivery : "—",
    energy: b.energy_label || "—",
    availability: units.find((u) => u.availability)?.availability || "—",
    parking: units.find((u) => u.parking_ratio)?.parking_ratio || "—",
    amenities: b.building_amenities ?? [],
    description: b.description || "",
    highway: b.accessibility_note || "—",
    airport: b.airport_note || "—",
    transit: b.public_transport_note || "—",
    imageClass: imageClasses[i % 3] ?? "",
    photos: photos.filter((p) => !isFloorplan(p)),
    floorplans: [...photos.filter(isFloorplan), ...unitFloorplans],
    lat: typeof b.latitude === "number" ? b.latitude : null,
    lng: typeof b.longitude === "number" ? b.longitude : null,
    geocodeQuery: [b.address, b.postal_code, b.city].filter(Boolean).join(", "),
  };
}

// Session cache for PDOK geocoding results (null = not found, don't retry) —
// only hit for buildings saved without coordinates; most already have them.
const geocodeCache = new Map<string, { lat: number; lng: number } | null>();
async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
  if (geocodeCache.has(query)) return geocodeCache.get(query)!;
  try {
    const res = await fetch(
      `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(query)}&rows=1`,
    );
    const j = await res.json();
    const pt: string | undefined = j?.response?.docs?.[0]?.centroide_ll;
    const m = pt?.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
    const found = m ? { lng: parseFloat(m[1]!), lat: parseFloat(m[2]!) } : null;
    geocodeCache.set(query, found);
    return found;
  } catch {
    geocodeCache.set(query, null);
    return null;
  }
}

export function BrochureView({ client }: { client: PublicClient }) {
  const buildings = useMemo(() => client.buildings.map(toBrochure), [client]);
  const [geo, setGeo] = useState<Record<string, { lat: number; lng: number } | null>>({});
  const [cityFilter, setCityFilter] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ building: string; index: number } | null>(null);

  const geoKey = buildings.map((b) => `${b.id}:${b.lat}:${b.lng}:${b.geocodeQuery}`).join("|");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const b of buildings) {
        if (b.lat != null && b.lng != null) continue;
        const found = await geocode(b.geocodeQuery);
        if (!cancelled) setGeo((g) => ({ ...g, [b.id]: found }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoKey]);

  const clientName = client.display_name;
  const area = buildings[0]?.neighborhood.split(" · ") ?? [];
  const count = pad(buildings.length);
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const mapBuildings: MapBuilding[] = buildings.flatMap((b) => {
    const lat = b.lat ?? geo[b.id]?.lat ?? null;
    const lng = b.lng ?? geo[b.id]?.lng ?? null;
    return lat != null && lng != null
      ? [{ id: b.id, number: b.number, name: b.name, address: b.address, available: b.available, city: b.city, lat, lng }]
      : [];
  });
  const cities = [...new Set(mapBuildings.map((b) => b.city).filter(Boolean))];
  const lightboxBuilding = lightbox ? buildings.find((b) => b.id === lightbox.building) : undefined;

  return (
    <div className="bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center px-5 sm:px-8">
          <span className="flex items-center gap-2.5 text-sm font-semibold text-dark">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-dark text-white">
              <Building2 size={17} />
            </span>
            Office Shortlist
          </span>
        </div>
      </header>

      {buildings.length > 0 && (
        <div className="print-hidden sticky top-16 z-20 border-b border-border bg-surface/95 backdrop-blur-sm">
          <div className="mx-auto flex min-h-11 max-w-[1180px] items-center gap-2 px-5 sm:px-8">
            <a href="#top" className="shrink-0 text-[11px] font-semibold text-foreground hover:text-accent">
              {clientName} <span className="text-muted">/</span> Shortlist
            </a>
            <nav
              aria-label="Building contents"
              className="ml-auto flex min-w-0 flex-1 items-center gap-1 overflow-x-auto sm:gap-2"
            >
              {buildings.map((b) => (
                <a
                  key={b.id}
                  href={`#${b.id}`}
                  className="shrink-0 rounded-lg px-2 py-2 text-[11px] font-medium text-muted transition-colors hover:bg-input-bg hover:text-dark sm:px-3 sm:text-xs"
                >
                  <span className="mr-1 text-accent">{b.number}</span>
                  <span className="hidden md:inline">{b.name}</span>
                  <span className="md:hidden">{b.name.split(" ")[0]}</span>
                </a>
              ))}
            </nav>
            <button
              type="button"
              onClick={() => window.print()}
              className="ml-2 inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-input-bg"
            >
              <Printer size={13} /> Download PDF
            </button>
          </div>
        </div>
      )}

      <section id="top" className="print-hero relative overflow-hidden bg-dark text-white">
        <div className="mx-auto grid min-h-[480px] max-w-[1440px] items-center gap-10 px-5 py-16 sm:px-10 lg:min-h-[560px] lg:grid-cols-[1fr_0.85fr] lg:px-16 lg:py-24">
          <div className="relative z-10 max-w-[650px]">
            <p className="mb-8 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">
              Office shortlist
              {area.length > 0 && (
                <>
                  <span className="mx-3">/</span>
                  {area[area.length - 1]}
                </>
              )}
            </p>
            <h1 className="max-w-[620px] text-5xl font-medium leading-[1.05] sm:text-6xl">{clientName}</h1>
            <p className="mt-7 max-w-md text-base leading-relaxed text-white/75 sm:text-lg">
              {buildings.length} building{buildings.length === 1 ? "" : "s"} selected for you.
            </p>
            <div className="mt-14 grid max-w-[480px] grid-cols-2 gap-x-8 gap-y-5 border-t border-white/25 pt-6 text-sm">
              <div>
                <div className="text-[10px] uppercase tracking-[0.13em] text-white/55">Prepared for</div>
                <div className="mt-1 font-medium">{clientName}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.13em] text-white/55">Date</div>
                <div className="mt-1 font-medium">{today}</div>
              </div>
            </div>
            {buildings.length > 0 && (
              <a
                href={`#${buildings[0]!.id}`}
                className="print-hidden mt-12 inline-flex items-center gap-2 text-xs font-semibold hover:underline"
              >
                Explore the shortlist <ArrowDown size={15} />
              </a>
            )}
          </div>
          <div className="print-hidden relative hidden min-h-[380px] self-stretch lg:block" aria-hidden="true">
            {buildings[0]?.photos[0] ? (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary captured URLs, no fixed domain to allowlist
              <img
                src={buildings[0].photos[0]}
                alt=""
                className="absolute inset-x-[5%] top-[5%] h-[80%] w-[90%] rotate-[-3deg] rounded-sm object-cover opacity-90 shadow-lg"
              />
            ) : (
              <div className="brochure-image absolute inset-x-[5%] top-[5%] h-[80%] w-[90%] rotate-[-3deg] rounded-sm" />
            )}
            <div className="absolute bottom-10 left-2 border-l border-white/40 pl-4 text-xs uppercase tracking-[0.14em] text-white/70">
              {count} building{buildings.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>
      </section>

      {buildings.length > 0 ? (
        <section className="border-b border-border bg-surface px-5 py-12 sm:px-10 lg:px-16">
          <div className="mx-auto grid max-w-[1180px] gap-8 lg:grid-cols-[220px_1fr] lg:gap-14">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">The selection</p>
              <h2 className="mt-3 text-2xl font-semibold">At a glance</h2>
            </div>
            <div className="grid gap-0 sm:grid-cols-3">
              {buildings.map((b) => (
                <a
                  key={b.id}
                  href={`#${b.id}`}
                  className="group flex items-start gap-4 border-t border-border py-5 first:sm:border-l-0 first:sm:pl-0 sm:border-l sm:border-t-0 sm:px-6 sm:py-1"
                >
                  <span className="text-xs font-semibold text-accent">{b.number}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold group-hover:text-accent">{b.name}</div>
                    <div className="mt-1 text-xs text-muted">{b.available} available</div>
                  </div>
                  <ChevronRight className="ml-auto size-4 shrink-0 text-muted transition-transform group-hover:translate-x-1" />
                </a>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <section className="mx-auto max-w-[1180px] px-5 py-20 text-center sm:px-10">
          <p className="text-sm text-muted">No buildings have been added to this shortlist yet.</p>
        </section>
      )}

      {buildings.length > 1 && (
        <section className="print-page border-b border-border bg-background px-5 py-12 sm:px-10 lg:px-16" aria-label="Side by side comparison">
          <div className="mx-auto max-w-[1180px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Compare</p>
            <h2 className="mt-3 text-2xl font-semibold">Side by side</h2>
            <div className="mt-7 overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="sticky left-0 z-10 w-40 bg-surface p-4 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                      Building
                    </th>
                    {buildings.map((b) => (
                      <th key={b.id} className="min-w-44 p-4 text-left">
                        <a href={`#${b.id}`} className="font-semibold hover:text-accent">
                          <span className="mr-1.5 text-xs text-accent">{b.number}</span>
                          {b.name}
                        </a>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["Available area", (b: Brochure) => b.available],
                      ["Divisible from", (b: Brochure) => b.divisibleFrom],
                      ["Rent / m² / yr", (b: Brochure) => b.rent],
                      ["Service charge / m² / yr", (b: Brochure) => b.service],
                      ["Delivery condition", (b: Brochure) => b.delivery],
                      ["Energy label", (b: Brochure) => b.energy],
                      ["Availability", (b: Brochure) => b.availability],
                      ["Parking", (b: Brochure) => b.parking],
                    ] as [string, (b: Brochure) => string][]
                  ).map(([label, get]) => (
                    <tr key={label} className="border-b border-border last:border-b-0">
                      <th className="sticky left-0 z-10 bg-surface p-4 text-left text-xs font-medium text-muted">{label}</th>
                      {buildings.map((b) => (
                        <td key={b.id} className="p-4 font-medium">
                          {get(b)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {mapBuildings.length > 0 && (
        <section className="print-page border-b border-border bg-surface px-5 py-12 sm:px-10 lg:px-16" aria-label="Locations">
          <div className="mx-auto max-w-[1180px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Where they are</p>
            <h2 className="mt-3 text-2xl font-semibold">Locations</h2>
            {cities.length > 1 && (
              <div className="print-hidden mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setCityFilter(null)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    cityFilter === null ? "border-dark bg-dark text-white" : "border-border bg-surface hover:bg-input-bg"
                  }`}
                >
                  All
                </button>
                {cities.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCityFilter(c)}
                    className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                      cityFilter === c ? "border-dark bg-dark text-white" : "border-border bg-surface hover:bg-input-bg"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_280px]">
              <div className="h-[360px] overflow-hidden rounded-2xl border border-border shadow-sm sm:h-[480px]">
                <ShortlistMap buildings={mapBuildings} city={cityFilter} hoveredId={hoveredId} />
              </div>
              <ul className="space-y-2">
                {mapBuildings.map((b) => (
                  <li key={b.id}>
                    <a
                      href={`#${b.id}`}
                      onMouseEnter={() => setHoveredId(b.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      className={`flex items-center gap-3 rounded-xl border p-3.5 transition-colors ${
                        hoveredId === b.id ? "border-accent bg-accent/5" : "border-border bg-background hover:bg-input-bg"
                      }`}
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-foreground">
                        {b.number}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{b.name}</span>
                        <span className="block truncate text-xs text-muted">{b.city}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {buildings.map((b, i) => (
        <BuildingSection
          key={b.id}
          building={b}
          index={i}
          buildings={buildings}
          onOpenLightbox={(index) => setLightbox({ building: b.id, index })}
        />
      ))}

      <footer className="print-page bg-dark px-5 py-12 text-white sm:px-10 lg:px-16">
        <div className="mx-auto flex max-w-[1180px] flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Building2 size={17} /> Office Shortlist
            </div>
            <p className="mt-4 max-w-sm text-xs leading-relaxed text-white/60">
              A focused view of your shortlisted offices, kept up to date by your broker.
            </p>
          </div>
          {buildings.length > 0 && (
            <a href="#top" className="print-hidden inline-flex items-center gap-2 text-xs font-medium hover:underline">
              Back to top <ArrowRight className="size-4 -rotate-90" />
            </a>
          )}
        </div>
      </footer>

      {lightbox && lightboxBuilding && (
        <Lightbox
          photos={lightboxBuilding.photos}
          name={lightboxBuilding.name}
          index={lightbox.index}
          onNavigate={(index) => setLightbox({ building: lightbox.building, index })}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

function Lightbox({
  photos,
  name,
  index,
  onNavigate,
  onClose,
}: {
  photos: string[];
  name: string;
  index: number;
  onNavigate: (i: number) => void;
  onClose: () => void;
}) {
  const [touchX, setTouchX] = useState<number | null>(null);
  const prev = () => onNavigate((index - 1 + photos.length) % photos.length);
  const next = () => onNavigate((index + 1) % photos.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!photos.length) return null;
  return (
    <div
      className="print-hidden fixed inset-0 z-50 flex flex-col bg-background/97 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`All photos of ${name}`}
      onTouchStart={(e) => setTouchX(e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        if (touchX == null) return;
        const dx = (e.changedTouches[0]?.clientX ?? touchX) - touchX;
        if (Math.abs(dx) > 48) (dx < 0 ? next : prev)();
        setTouchX(null);
      }}
    >
      <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <p className="text-sm font-semibold">
          {name} <span className="ml-2 text-xs font-medium text-muted">{index + 1} / {photos.length}</span>
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close gallery"
          className="rounded-full border border-border bg-surface p-2 transition-colors hover:bg-input-bg"
        >
          <X size={17} />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-5 pb-5 sm:px-20">
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary captured URLs, no fixed domain to allowlist */}
        <img src={photos[index]} alt={`${name} photo ${index + 1}`} className="max-h-full max-w-full rounded-xl object-contain shadow-lg" />
        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="Previous photo"
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-border bg-surface p-2.5 shadow-sm transition-colors hover:bg-input-bg sm:left-6"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next photo"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-border bg-surface p-2.5 shadow-sm transition-colors hover:bg-input-bg sm:right-6"
            >
              <ChevronRight size={18} />
            </button>
          </>
        )}
      </div>
      {photos.length > 1 && (
        <div className="flex justify-center gap-2 overflow-x-auto px-5 pb-5">
          {photos.map((p, i) => (
            <button
              key={p}
              type="button"
              onClick={() => onNavigate(i)}
              aria-label={`Photo ${i + 1}`}
              className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                i === index ? "border-accent" : "border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary captured URLs, no fixed domain to allowlist */}
              <img src={p} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BuildingSection({
  building: b,
  index,
  buildings,
  onOpenLightbox,
}: {
  building: Brochure;
  index: number;
  buildings: Brochure[];
  onOpenLightbox: (index: number) => void;
}) {
  const next = buildings[index + 1];
  const connections = [
    ["Highway", b.highway],
    ["Airport", b.airport],
    ["Public transport", b.transit],
  ].filter((pair): pair is [string, string] => pair[1] !== "—");

  return (
    <section id={b.id} className={`print-page scroll-mt-28 border-b border-border ${index % 2 === 0 ? "bg-background" : "bg-surface"}`}>
      <div className="mx-auto max-w-[1180px] px-5 py-14 sm:px-10 sm:py-20 lg:px-16">
        <div className="mb-8 flex items-center justify-between border-b border-border pb-4 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted">
          <span>
            Property {b.number} / {pad(buildings.length)}
          </span>
          <span>{b.city}</span>
        </div>

        <div className="mb-9 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            {b.neighborhood && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-accent">
                <MapPin size={13} />
                {b.neighborhood}
              </p>
            )}
            <h2 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">{b.name}</h2>
            <p className="mt-3 text-sm text-muted">{b.address}</p>
          </div>
          <div className="w-fit rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] font-medium">
            {b.energy} energy label
          </div>
        </div>

        <div className="grid gap-2 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,0.8fr)]">
          {b.photos[0] ? (
            <button type="button" onClick={() => onOpenLightbox(0)} className="print-hidden min-w-0 cursor-pointer">
              {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary captured URLs, no fixed domain to allowlist */}
              <img src={b.photos[0]} alt={b.name} className="aspect-[1.55] w-full rounded-xl object-cover lg:aspect-auto lg:h-full lg:min-h-[420px]" />
            </button>
          ) : (
            <div className={`brochure-image ${b.imageClass} relative aspect-[1.55] min-w-0 rounded-xl lg:aspect-auto lg:min-h-[420px]`} role="img" aria-label={`No photo yet for ${b.name}`} />
          )}
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            {[1, 2].map((n) =>
              b.photos[n] ? (
                <button key={n} type="button" onClick={() => onOpenLightbox(n)} className="print-hidden min-w-0 cursor-pointer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary captured URLs, no fixed domain to allowlist */}
                  <img src={b.photos[n]} alt={`${b.name} photo ${n + 1}`} loading="lazy" className="aspect-[1.4] h-full w-full rounded-xl object-cover lg:aspect-auto" />
                </button>
              ) : (
                <div key={n} className={`brochure-image ${b.imageClass} relative aspect-[1.4] rounded-xl lg:aspect-auto`} role="img" aria-label={`No photo yet for ${b.name}`} />
              ),
            )}
          </div>
        </div>

        {b.photos.length > 0 && (
          <div className="print-hidden mt-3">
            <button
              type="button"
              onClick={() => onOpenLightbox(0)}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-xs font-semibold shadow-sm transition-colors hover:bg-input-bg"
            >
              <Images size={14} className="text-accent" /> View all {b.photos.length} photos
            </button>
          </div>
        )}

        {b.floorplans.length > 0 && (
          <div className="mt-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Floor plan</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {b.floorplans.map((f) => (
                // eslint-disable-next-line @next/next/no-img-element -- arbitrary captured URLs, no fixed domain to allowlist
                <img key={f} src={f} alt={`${b.name} floor plan`} loading="lazy" className="aspect-[1.4] w-full rounded-xl border border-border bg-surface object-contain" />
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 grid grid-cols-2 gap-y-6 border-y border-border py-7 sm:grid-cols-3 lg:grid-cols-5">
          {[
            ["Available area", b.available],
            ["Rent / m² / yr", b.rent],
            ["Service / m² / yr", b.service],
            ["Energy label", b.energy],
            ["Availability", b.availability],
          ].map(([label, value]) => (
            <div key={label} className="border-l border-border pl-4 first:border-l-0 first:pl-0 sm:pl-6 lg:pl-8">
              <div className="text-[10px] font-medium uppercase tracking-[0.09em] text-muted">{label}</div>
              <div className="mt-2 text-xl font-semibold sm:text-2xl">{value}</div>
            </div>
          ))}
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-[1.25fr_0.75fr] lg:gap-24">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">The opportunity</p>
            {b.description && <p className="mt-5 max-w-[700px] text-lg leading-[1.7] sm:text-xl">{b.description}</p>}
            {b.amenities.length > 0 && (
              <div className="mt-7 flex flex-wrap gap-2">
                {b.amenities.map((a) => (
                  <span key={a} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] font-medium">
                    <Check className="size-3 text-accent" />
                    {a}
                  </span>
                ))}
              </div>
            )}
          </div>
          {connections.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Connections</p>
              <div className="mt-4 divide-y divide-border border-y border-border">
                {connections.map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-4 py-4 text-sm">
                    <span className="text-muted">{label}</span>
                    <span className="text-right font-semibold">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="print-hidden mt-20 flex justify-end border-t border-border pt-6">
          {next ? (
            <a href={`#${next.id}`} className="group inline-flex items-center gap-3 text-xs font-semibold text-accent">
              Next property <span className="font-normal text-foreground">{next.name}</span>
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </a>
          ) : (
            <a href="#top" className="inline-flex items-center gap-2 text-xs font-semibold text-accent">
              Return to cover <ArrowRight className="size-4 -rotate-90" />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
