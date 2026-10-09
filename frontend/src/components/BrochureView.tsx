"use client";

import { ArrowDown, ArrowRight, Building2, ChevronLeft, ChevronRight, Images, Printer, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicBuilding, PublicClient, Unit } from "@/lib/types";
import { formatArea, formatPriceParts, isFlexOnly, rentParts, serviceChargeParts, type PricePart } from "@/lib/format";
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
  /** "Zuidas, Amsterdam" — submarket first, since that's how brokers and
   * clients actually talk about where a building is. */
  area: string;
  city: string;
  available: string;
  divisibleFrom: string;
  rent: PricePart[];
  rentText: string;
  service: PricePart[];
  serviceText: string;
  delivery: string;
  energy: string;
  availability: string;
  parking: string;
  amenities: string[];
  description: string;
  highway: string;
  airport: string;
  transit: string;
  photos: string[];
  floorplans: string[];
  lat: number | null;
  lng: number | null;
  geocodeQuery: string;
};

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const isFloorplan = (url: string) => /plattegrond|floorplan/i.test(url);

const deliveryLabels: Record<string, string> = {
  turn_key: "Turn-key",
  shell_and_core: "Shell & core",
  shell_and_core_plus: "Shell & core+",
  mixed: "Mixed",
};

function toBrochure(b: PublicBuilding, i: number): Brochure {
  const units: Unit[] = b.units ?? [];
  const photos = b.photos ?? [];
  const totalAvailable = units.reduce((sum, u) => sum + (u.available_area_m2 ?? 0), 0);
  const divisible = units.map((u) => u.min_divisible_area_m2).filter((v): v is number => typeof v === "number");
  const unitFloorplans = units.map((u) => u.floorplan_url).filter((v): v is string => Boolean(v));
  const delivery = units.find((u) => u.delivery_condition)?.delivery_condition ?? null;
  const rent = rentParts(units);
  const service = serviceChargeParts(units);
  return {
    id: `b-${b.building_id}`,
    number: pad(i + 1),
    name: b.name,
    address: [b.address, [b.postal_code, b.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    area: [b.submarket, b.city].filter(Boolean).join(", "),
    city: b.city || "",
    available: totalAvailable > 0 ? formatArea(totalAvailable) : "On request",
    divisibleFrom: divisible.length ? `${fmt(Math.min(...divisible))} m²` : "—",
    rent,
    rentText: rent.length ? formatPriceParts(rent) : "On request",
    service,
    // A flex desk price has no separate service charge — "On request" there
    // would wrongly suggest there's a figure still to come.
    serviceText: service.length ? formatPriceParts(service) : isFlexOnly(units) ? "—" : "On request",
    delivery: delivery ? deliveryLabels[delivery] ?? delivery : "—",
    energy: b.energy_label || "—",
    availability: units.find((u) => u.availability)?.availability || "—",
    parking: units.find((u) => u.parking_ratio)?.parking_ratio || "—",
    amenities: b.building_amenities ?? [],
    description: b.description || "",
    highway: b.accessibility_note || "—",
    airport: b.airport_note || "—",
    transit: b.public_transport_note || "—",
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

/** "Download PDF" prints the page. Lazy-loaded photos that were never
 * scrolled into view would print as blank boxes, so load them all first
 * (capped, so one dead image URL can't block printing). */
async function printBrochure() {
  const lazy = Array.from(document.querySelectorAll<HTMLImageElement>(".brochure img[loading='lazy']"));
  lazy.forEach((img) => (img.loading = "eager"));
  const pending = lazy.filter((img) => !img.complete);
  await Promise.race([
    Promise.all(
      pending.map(
        (img) =>
          new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          }),
      ),
    ),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  window.print();
}

/** Wipe-in for a building's lead photo as it scrolls into view. Only arms
 * (hides) elements that start off-screen, so nothing visible on load ever
 * blinks out, and the hidden state is screen-only CSS — print, no-JS and
 * reduced-motion all get the plain photo. */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.classList.add("is-armed");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          el.classList.add("is-in");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

const listFormat = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

export function BrochureView({ client }: { client: PublicClient }) {
  const buildings = useMemo(() => client.buildings.map(toBrochure), [client]);
  const [geo, setGeo] = useState<Record<string, { lat: number; lng: number } | null>>({});
  const [cityFilter, setCityFilter] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ building: string; index: number } | null>(null);
  const [printing, setPrinting] = useState(false);

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
  const allCities = [...new Set(buildings.map((b) => b.city).filter(Boolean))];
  // Pinned to Amsterdam time so the server render and the browser agree on
  // the date even around midnight (otherwise: a hydration mismatch).
  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Amsterdam",
  });
  const heroPhoto = buildings.find((b) => b.photos[0])?.photos[0];
  const countLabel = `${buildings.length} building${buildings.length === 1 ? "" : "s"}${
    allCities.length ? ` in ${listFormat.format(allCities)}` : ""
  }`;
  const firstAnchor = buildings.length > 1 ? "glance" : buildings[0]?.id;

  const mapBuildings: MapBuilding[] = buildings.flatMap((b) => {
    const lat = b.lat ?? geo[b.id]?.lat ?? null;
    const lng = b.lng ?? geo[b.id]?.lng ?? null;
    return lat != null && lng != null
      ? [{ id: b.id, number: b.number, name: b.name, address: b.address, available: b.available, city: b.city, lat, lng }]
      : [];
  });
  const mapCities = [...new Set(mapBuildings.map((b) => b.city).filter(Boolean))];
  const lightboxBuilding = lightbox ? buildings.find((b) => b.id === lightbox.building) : undefined;

  async function handlePrint() {
    setPrinting(true);
    try {
      await printBrochure();
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="brochure min-h-screen bg-background text-foreground">
      <header className="print-hidden sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-3 px-5 sm:gap-5 sm:px-8">
          <a href="#top" className="flex shrink-0 items-center gap-2.5 text-sm font-semibold text-dark">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-dark text-white">
              <Building2 size={15} aria-hidden="true" />
            </span>
            <span className="hidden sm:inline">Office Shortlist</span>
          </a>
          {buildings.length > 0 && (
            <nav aria-label="Buildings on this shortlist" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
              {buildings.map((b) => (
                <a
                  key={b.id}
                  href={`#${b.id}`}
                  className="shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-input-bg hover:text-foreground"
                >
                  <span className="tabular-nums text-accent">{b.number}</span>
                  <span className="ml-1.5 hidden lg:inline">{b.name}</span>
                </a>
              ))}
            </nav>
          )}
          <button
            type="button"
            onClick={handlePrint}
            disabled={printing}
            aria-label="Download PDF"
            className="ml-auto inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-xs font-semibold transition-colors hover:bg-input-bg disabled:opacity-60 sm:px-4"
          >
            <Printer size={14} aria-hidden="true" />
            <span className="hidden sm:inline">{printing ? "Preparing…" : "Download PDF"}</span>
          </button>
        </div>
      </header>

      {/* Cover. The building photo is the most telling thing a shortlist
          has, so it carries the page; the client's name is the one big type
          moment. */}
      <section
        id="top"
        className="brochure-hero relative isolate flex min-h-[78svh] items-end overflow-hidden bg-dark text-white lg:min-h-[86svh]"
      >
        {heroPhoto && (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary captured URLs, no fixed domain to allowlist
          <img
            src={heroPhoto}
            alt=""
            fetchPriority="high"
            className="brochure-hero-photo absolute inset-0 -z-10 h-full w-full object-cover"
          />
        )}
        <div
          aria-hidden="true"
          className="brochure-hero-scrim absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgb(9_20_48/0.92)_0%,rgb(9_20_48/0.55)_38%,rgb(9_20_48/0.05)_72%)]"
        />
        <div className="brochure-hero-body mx-auto w-full max-w-[1280px] px-5 pb-10 pt-28 sm:px-8 sm:pb-14 lg:pb-16">
          <p className="brochure-hero-meta text-base text-white/80 sm:text-lg">Office shortlist for</p>
          <h1 className="brochure-hero-title mt-2 overflow-hidden pb-[0.06em]">
            <span className="block font-display text-[clamp(3.25rem,10.5vw,9.5rem)] font-normal leading-[0.95] tracking-[-0.015em] text-balance">
              {clientName}
            </span>
          </h1>
          <div className="brochure-hero-meta mt-8 flex flex-wrap items-center gap-x-8 gap-y-2 border-t border-white/25 pt-5 text-sm text-white/80">
            <span>{countLabel}</span>
            <span>Prepared {today}</span>
            {firstAnchor && (
              <a
                href={`#${firstAnchor}`}
                className="print-hidden ml-auto inline-flex items-center gap-2 font-medium text-white hover:underline"
              >
                See the shortlist <ArrowDown size={15} aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      </section>

      {buildings.length === 0 && (
        <section className="mx-auto max-w-[1280px] px-5 py-24 sm:px-8">
          <p className="text-base text-muted">No buildings have been added to this shortlist yet.</p>
        </section>
      )}

      {buildings.length > 1 && (
        <section id="glance" aria-label="Side by side comparison" className="print-break scroll-mt-14 bg-surface">
          <div className="brochure-pad mx-auto max-w-[1280px] px-5 py-16 sm:px-8 sm:py-24">
            <h2 className="font-display text-[clamp(2.25rem,4.5vw,3.5rem)] leading-none">At a glance</h2>
            <div className="mt-10 overflow-x-auto print:mt-6 print:overflow-visible">
              <table className="w-full min-w-[640px] border-collapse text-[15px] print:min-w-0 print:text-[11px]">
                <thead>
                  <tr className="border-b border-foreground/80">
                    <th
                      scope="col"
                      className="sticky left-0 z-10 w-28 bg-surface pb-4 pr-4 text-left align-top sm:w-44 sm:pr-6 print:w-24"
                    >
                      <span className="sr-only">Building</span>
                    </th>
                    {buildings.map((b) => (
                      <th
                        key={b.id}
                        scope="col"
                        className="min-w-44 pb-4 pr-6 text-left align-top font-normal print:min-w-0 print:pr-3"
                      >
                        <a href={`#${b.id}`} className="group block">
                          <span className="block text-xs font-semibold tabular-nums text-accent">{b.number}</span>
                          <span className="mt-1 block font-display text-2xl leading-tight group-hover:text-accent print:text-base">
                            {b.name}
                          </span>
                          <span className="mt-1 block text-xs text-muted print:text-[9px]">{b.area}</span>
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
                      ["Rent", (b: Brochure) => <PriceStack parts={b.rent} fallback={b.rentText} />],
                      ["Service charge", (b: Brochure) => <PriceStack parts={b.service} fallback={b.serviceText} />],
                      ["Delivery condition", (b: Brochure) => b.delivery],
                      ["Energy label", (b: Brochure) => b.energy],
                      ["Availability", (b: Brochure) => b.availability],
                      ["Parking", (b: Brochure) => b.parking],
                    ] as [string, (b: Brochure) => React.ReactNode][]
                  ).map(([label, get]) => (
                    <tr key={label} className="border-b border-border">
                      <th
                        scope="row"
                        className="sticky left-0 z-10 bg-surface py-4 pr-4 text-left align-top text-[11px] font-semibold uppercase tracking-[0.08em] text-muted sm:pr-6 print:py-2 print:text-[8px]"
                      >
                        {label}
                      </th>
                      {buildings.map((b) => (
                        <td key={b.id} className="py-4 pr-6 align-top font-medium tabular-nums print:py-2 print:pr-3">
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
        <section aria-label="Locations" className="print-keep border-t border-border bg-background">
          <div className="brochure-pad mx-auto max-w-[1280px] px-5 py-16 sm:px-8 sm:py-24">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="font-display text-[clamp(2.25rem,4.5vw,3.5rem)] leading-none">Locations</h2>
              {mapCities.length > 1 && (
                <div className="print-hidden flex flex-wrap gap-2">
                  {[null, ...mapCities].map((c) => (
                    <button
                      key={c ?? "all"}
                      type="button"
                      onClick={() => setCityFilter(c)}
                      aria-pressed={cityFilter === c}
                      className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                        cityFilter === c ? "border-dark bg-dark text-white" : "border-border bg-surface hover:bg-input-bg"
                      }`}
                    >
                      {c ?? "All"}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] print:mt-5 print:grid-cols-1 print:gap-3">
              <div className="h-[360px] overflow-hidden rounded-xl border border-border sm:h-[500px] print:h-[80mm]">
                <ShortlistMap buildings={mapBuildings} city={cityFilter} hoveredId={hoveredId} />
              </div>
              <ol className="divide-y divide-border border-y border-border print:grid print:grid-cols-3 print:gap-x-4 print:divide-y-0 print:border-0">
                {mapBuildings.map((b) => (
                  <li key={b.id}>
                    <a
                      href={`#${b.id}`}
                      onMouseEnter={() => setHoveredId(b.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onFocus={() => setHoveredId(b.id)}
                      onBlur={() => setHoveredId(null)}
                      className={`flex items-center gap-4 px-1 py-4 transition-colors print:gap-2 print:py-1.5 ${
                        hoveredId === b.id ? "text-accent" : "hover:text-accent"
                      }`}
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold tabular-nums text-accent-foreground">
                        {b.number}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-display text-xl leading-tight print:text-sm">{b.name}</span>
                        <span className="block truncate text-xs text-muted">{b.available} available</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>
      )}

      {buildings.map((b, i) => (
        <BuildingSection
          key={b.id}
          building={b}
          next={buildings[i + 1]}
          total={buildings.length}
          onOpenLightbox={(index) => setLightbox({ building: b.id, index })}
        />
      ))}

      <footer className="print-keep bg-dark text-white">
        <div className="mx-auto flex max-w-[1280px] flex-col justify-between gap-6 px-5 py-14 sm:flex-row sm:items-end sm:px-8 print:px-0 print:py-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Building2 size={16} aria-hidden="true" /> Office Shortlist
            </div>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/65">
              Prepared for {clientName} by your broker. This page stays up to date as the shortlist changes.
            </p>
          </div>
          {buildings.length > 0 && (
            <a href="#top" className="print-hidden inline-flex items-center gap-2 text-sm font-medium hover:underline">
              Back to top <ArrowRight className="size-4 -rotate-90" aria-hidden="true" />
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

/** "€395–€410" with a smaller "/m²/yr" after it; a building with both
 * direct-lease and flex space gets one line per pricing model. */
function PriceStack({ parts, fallback, large = false }: { parts: PricePart[]; fallback: string; large?: boolean }) {
  if (parts.length === 0) return <>{fallback}</>;
  return (
    <span className="flex flex-col gap-0.5">
      {parts.map((p) => (
        <span key={p.per} className="whitespace-nowrap print:whitespace-normal">
          {p.amount}
          <span className={`ml-0.5 font-normal text-muted ${large ? "text-sm sm:text-base" : "text-xs"}`}>{p.per}</span>
        </span>
      ))}
    </span>
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

  // Keep the page behind the gallery from scrolling while it's open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

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
          {name} <span className="ml-2 text-xs font-medium tabular-nums text-muted">{index + 1} / {photos.length}</span>
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close gallery"
          autoFocus
          className="rounded-full border border-border bg-surface p-2 transition-colors hover:bg-input-bg"
        >
          <X size={17} />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-5 pb-5 sm:px-20">
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary captured URLs, no fixed domain to allowlist */}
        <img src={photos[index]} alt={`${name}, photo ${index + 1}`} className="max-h-full max-w-full rounded-lg object-contain" />
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
              aria-current={i === index}
              className={`h-14 w-20 shrink-0 overflow-hidden rounded-md border-2 transition-colors ${
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

/** Floor plans come from captured URLs that can go stale. A broken one is
 * dropped rather than shown to a client as an empty frame with alt text,
 * and the heading goes too once none are left. */
function FloorPlans({ urls, name }: { urls: string[]; name: string }) {
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const working = urls.filter((u) => !broken.has(u));
  if (working.length === 0) return null;
  return (
    <div className="print-keep mt-14 print:mt-5">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted print:text-[8px]">Floor plan</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:mt-2 print:grid-cols-3">
        {working.map((f) => (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary captured URLs, no fixed domain to allowlist
          <img
            key={f}
            src={f}
            alt={`${name} floor plan`}
            loading="lazy"
            onError={() => setBroken((prev) => new Set(prev).add(f))}
            className="aspect-[1.4] w-full rounded-lg border border-border bg-surface object-contain print:h-[38mm] print:aspect-auto"
          />
        ))}
      </div>
    </div>
  );
}

function BuildingSection({
  building: b,
  next,
  total,
  onOpenLightbox,
}: {
  building: Brochure;
  next: Brochure | undefined;
  total: number;
  onOpenLightbox: (index: number) => void;
}) {
  const leadRef = useReveal<HTMLDivElement>();
  const connections = [
    ["Highway", b.highway],
    ["Airport", b.airport],
    ["Public transport", b.transit],
  ].filter((pair): pair is [string, string] => pair[1] !== "—");
  const morePhotos = b.photos.slice(1, 3);

  const stats: [string, React.ReactNode][] = [
    ["Available area", b.available],
    ["Rent", <PriceStack key="rent" parts={b.rent} fallback={b.rentText} large />],
    ["Service charge", <PriceStack key="service" parts={b.service} fallback={b.serviceText} large />],
    ["Availability", b.availability],
    ["Energy label", b.energy],
  ];

  return (
    <section id={b.id} aria-labelledby={`${b.id}-name`} className="print-break scroll-mt-14 border-t border-border bg-surface">
      <div className="brochure-pad mx-auto max-w-[1280px] px-5 pt-16 sm:px-8 sm:pt-24">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-sm text-muted">
          <span>
            <span className="font-semibold tabular-nums text-accent">{b.number}</span>
            <span className="tabular-nums"> of {pad(total)}</span>
          </span>
          {b.area && <span>{b.area}</span>}
        </div>
        <h2
          id={`${b.id}-name`}
          className="mt-4 font-display text-[clamp(2.75rem,7vw,6.25rem)] font-normal leading-[0.95] tracking-[-0.01em] text-balance print:mt-2 print:text-[40px]"
        >
          {b.name}
        </h2>
        <p className="mt-4 text-base text-muted print:mt-2 print:text-sm">{b.address}</p>
      </div>

      {b.photos[0] && (
        <div ref={leadRef} className="brochure-reveal brochure-lead-photo mt-10 sm:mt-14 print:mt-5">
          <button
            type="button"
            onClick={() => onOpenLightbox(0)}
            aria-label={`Open the photos of ${b.name}`}
            className="block w-full cursor-zoom-in"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary captured URLs, no fixed domain to allowlist */}
            <img
              src={b.photos[0]}
              alt={b.name}
              className="h-[66vw] max-h-[82vh] w-full object-cover sm:h-[52vw]"
            />
          </button>
        </div>
      )}

      <div className="brochure-pad mx-auto max-w-[1280px] px-5 pb-20 sm:px-8 sm:pb-28">
        <dl className="print-keep grid grid-cols-2 gap-x-6 gap-y-8 border-b border-border py-10 sm:grid-cols-3 lg:grid-cols-5 print:grid-cols-5 print:gap-y-3 print:py-4">
          {stats.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted print:text-[8px]">{label}</dt>
              <dd
                className={`mt-2 font-medium tabular-nums leading-tight print:mt-1 print:text-base ${
                  // Free-text values ("Per direct / in overleg") would wrap
                  // badly at the size that suits a figure like "581 m²".
                  typeof value === "string" && value.length > 14 ? "text-lg sm:text-xl" : "text-2xl sm:text-[28px]"
                }`}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>

        {(b.description || b.amenities.length > 0 || connections.length > 0) && (
          <div className="print-keep mt-12 grid gap-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-20 print:mt-5 print:grid-cols-[1.4fr_1fr] print:gap-8">
            <div>
              {b.description && (
                <p className="max-w-[62ch] text-lg leading-[1.7] text-foreground/90 sm:text-xl print:text-[12px]">
                  {b.description}
                </p>
              )}
              {b.amenities.length > 0 && (
                <ul
                  aria-label="Amenities"
                  className={`flex flex-wrap gap-2 print:gap-1 ${b.description ? "mt-8 print:mt-3" : ""}`}
                >
                  {b.amenities.map((a) => (
                    <li key={a} className="rounded-full border border-border px-3.5 py-1.5 text-sm print:px-2 print:py-0.5 print:text-[10px]">
                      {a}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {connections.length > 0 && (
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted print:text-[8px]">
                  Getting there
                </h3>
                <dl className="mt-3 divide-y divide-border border-y border-border print:mt-1">
                  {connections.map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-baseline justify-between gap-4 py-3.5 text-[15px] print:py-1.5 print:text-[11px]"
                    >
                      <dt className="text-muted">{label}</dt>
                      <dd className="text-right font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        )}

        {morePhotos.length > 0 && (
          <div className="brochure-more-photos mt-14 grid grid-cols-2 gap-2 print:mt-5">
            {morePhotos.map((src, n) => (
              <button
                key={src}
                type="button"
                onClick={() => onOpenLightbox(n + 1)}
                aria-label={`Open photo ${n + 2} of ${b.name}`}
                className="block cursor-zoom-in"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary captured URLs, no fixed domain to allowlist */}
                <img src={src} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
              </button>
            ))}
          </div>
        )}
        {b.photos.length > 1 && (
          <button
            type="button"
            onClick={() => onOpenLightbox(0)}
            className="print-hidden mt-4 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-input-bg"
          >
            <Images size={15} className="text-accent" aria-hidden="true" /> View all {b.photos.length} photos
          </button>
        )}

        <FloorPlans urls={b.floorplans} name={b.name} />

        <div className="print-hidden mt-16 flex justify-end border-t border-border pt-6">
          {next ? (
            <a href={`#${next.id}`} className="group inline-flex items-center gap-3 text-sm">
              <span className="text-muted">Next</span>
              <span className="font-display text-xl group-hover:text-accent">{next.name}</span>
              <ArrowRight className="size-4 text-accent transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </a>
          ) : (
            <a href="#top" className="inline-flex items-center gap-2 text-sm font-medium text-accent">
              Back to the cover <ArrowRight className="size-4 -rotate-90" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
