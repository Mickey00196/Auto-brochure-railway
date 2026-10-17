"use client";

import { ArrowDown, ArrowRight, ChevronLeft, ChevronRight, Images, Mail, Phone, Printer, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicBuilding, PublicClient, Unit } from "@/lib/types";
import { floorRank } from "@/lib/floors";
import { energyColor } from "@/lib/energy";
import { splitDistance } from "@/lib/distance";
import {
  brochureText,
  deliveryLabel,
  formatDate,
  listJoin,
  localDecimal,
  numberFormat,
  translateAmenities,
  translateAvailability,
  translateFloor,
  type BrochureText,
  type Lang,
} from "@/lib/brochureText";
import type { MapBuilding } from "./ShortlistMap";

const ShortlistMap = dynamic(() => import("./ShortlistMap"), { ssr: false });

const COMPANY = "Cushman & Wakefield";
const LOGO_SRC = "/brand/cushman-wakefield.png";

/** One price as the page shows it: "€375–€450" with a smaller "/m²/yr". */
type PricePart = { amount: string; per: string; from?: boolean };
type Fmt = ReturnType<typeof numberFormat>;

type Floor = {
  key: string;
  label: string;
  note: string;
  area: number;
  rent: PricePart | null;
  /** (rent + service charges) × m² — null when there's no rent to go on. */
  yearly: number | null;
};

type Brochure = {
  id: string;
  number: string;
  name: string;
  address: string;
  /** "Zuidas, Amsterdam" — submarket first, since that's how brokers and
   * clients actually talk about where a building is. */
  area: string;
  city: string;
  totalAvailable: number;
  divisibleFrom: string | null;
  rent: PricePart[];
  service: PricePart[];
  /** What to show when there's no service-charge figure: "On request", or
   * nothing to come at all for flex-only space. */
  serviceFallback: string;
  parking: string | null;
  parkingPrice: PricePart[];
  delivery: string | null;
  energy: string | null;
  availability: string | null;
  yearBuilt: string | null;
  buildingArea: string | null;
  breeam: string | null;
  floors: Floor[];
  amenities: string[];
  description: string;
  brokerNote: string;
  watchOut: string;
  connections: { label: string; place: string; value: string }[];
  photos: string[];
  floorplans: string[];
  lat: number | null;
  lng: number | null;
  geocodeQuery: string;
};

const pad = (n: number) => String(n).padStart(2, "0");
const isFloorplan = (url: string) => /plattegrond|floorplan/i.test(url);
const isDesk = (u: Unit) => u.pricing_model === "per_desk_monthly";
const sqmRent = (u: Unit) =>
  !isDesk(u) && u.rent_price_type !== "tbd" && u.rent_price_type !== "on_request" && typeof u.rent_eur_per_m2_year === "number"
    ? u.rent_eur_per_m2_year
    : null;

function range(values: number[], f: Fmt): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? f.money(min) : `${f.money(min)}–${f.money(max)}`;
}

/** Rent across a building's spaces. Direct lease (€/m²/yr) and flex
 * (€/desk/mo) stay on their own lines, and an asking price stays "from". */
function rentParts(units: Unit[], f: Fmt, t: BrochureText): PricePart[] {
  const parts: PricePart[] = [];
  const priced = units.filter((u) => sqmRent(u) !== null);
  if (priced.length) {
    const values = priced.map((u) => sqmRent(u)!);
    const from = priced.some((u) => u.rent_price_type === "from");
    parts.push({ amount: from ? f.money(Math.min(...values)) : range(values, f), per: t.perSqmYear, from });
  }
  const desk = units.filter(isDesk).map((u) => u.price_per_desk_month_eur).filter((v): v is number => typeof v === "number");
  if (desk.length) parts.push({ amount: range(desk, f), per: t.perDeskMonth });
  return parts;
}

function toBrochure(b: PublicBuilding, i: number, lang: Lang, t: BrochureText, f: Fmt): Brochure {
  const units: Unit[] = b.units ?? [];
  const photos = b.photos ?? [];
  const totalAvailable = units.reduce((sum, u) => sum + (u.available_area_m2 ?? 0), 0);
  const divisible = units.map((u) => u.min_divisible_area_m2).filter((v): v is number => typeof v === "number");
  const serviceValues = units
    .filter((u) => !isDesk(u))
    .map((u) => u.service_charge_eur_per_m2_year)
    .filter((v): v is number => typeof v === "number");
  const deliveryOf = (d: string | null | undefined) => deliveryLabel(t, d);
  const parkingAddOn = (b.addons ?? []).find((a) => /parking|parkeer/i.test(a.name));
  const parkingPrice: PricePart[] = parkingAddOn
    ? [
        {
          amount: f.money(parkingAddOn.price),
          per: /month|maand|mnd/i.test(parkingAddOn.price_unit)
            ? t.perSpaceMonth
            : /year|jaar/i.test(parkingAddOn.price_unit)
              ? t.perSpaceYear
              : `/${parkingAddOn.price_unit.replace(/^EUR\s*\/\s*/i, "").replace(/\s+/g, "")}`,
        },
      ]
    : [];
  const floors: Floor[] = [...units]
    .map((u, n) => ({ u, n }))
    .sort((x, y) => floorRank(y.u.floor ?? "") - floorRank(x.u.floor ?? ""))
    .map(({ u, n }) => {
      const rent = sqmRent(u);
      const area = u.available_area_m2 ?? 0;
      const availability =
        u.availability && !/^(tbd|n\/?a)$/i.test(u.availability.trim()) ? translateAvailability(u.availability, lang) : null;
      return {
        key: u.unit_id,
        label: u.floor ? translateFloor(u.floor, lang) : t.space(n + 1),
        note: [availability, deliveryOf(u.delivery_condition)].filter(Boolean).join(" · "),
        area,
        rent:
          rent !== null
            ? { amount: f.money(rent), per: t.perSqmYear, from: u.rent_price_type === "from" }
            : isDesk(u) && typeof u.price_per_desk_month_eur === "number"
              ? { amount: f.money(u.price_per_desk_month_eur), per: t.perDeskMonth }
              : null,
        yearly: rent !== null && area > 0 ? area * (rent + (u.service_charge_eur_per_m2_year ?? 0)) : null,
      };
    });
  const firstAvailability = units.find((u) => u.availability && !/^(tbd|n\/?a)$/i.test(u.availability.trim()))?.availability;
  const connections = (
    [
      [t.highway, b.accessibility_note],
      [t.airport, b.airport_note],
      [t.transit, b.public_transport_note],
    ] as [string, string | null][]
  )
    .filter((c): c is [string, string] => Boolean(c[1] && c[1].trim()))
    .map(([label, note]) => {
      const { place, value } = splitDistance(note);
      return { label, place, value: localDecimal(value, lang) };
    });

  return {
    id: `b-${b.building_id}`,
    number: pad(i + 1),
    name: b.name,
    address: [b.address, [b.postal_code, b.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    area: [b.submarket, b.city].filter(Boolean).join(", "),
    city: b.city || "",
    totalAvailable,
    divisibleFrom: divisible.length ? f.area(Math.min(...divisible)) : null,
    rent: rentParts(units, f, t),
    service: serviceValues.length ? [{ amount: range(serviceValues, f), per: t.perSqmYear }] : [],
    // A flex desk price has no separate service charge — "On request" there
    // would wrongly suggest there's a figure still to come.
    serviceFallback: units.length > 0 && units.every(isDesk) ? "—" : t.onRequest,
    parking: units.find((u) => u.parking_ratio)?.parking_ratio || null,
    parkingPrice,
    delivery: deliveryOf(units.find((u) => u.delivery_condition)?.delivery_condition),
    energy: b.energy_label || null,
    availability: firstAvailability ? translateAvailability(firstAvailability, lang) : null,
    yearBuilt: b.year_built ? String(b.year_built) : null,
    buildingArea: b.total_building_area_m2 ? f.area(b.total_building_area_m2) : null,
    breeam: b.breeam_rating || null,
    floors,
    amenities: translateAmenities(b.building_amenities ?? [], lang),
    description: b.description || "",
    brokerNote: (b.broker_note ?? "").trim(),
    watchOut: (b.watch_out ?? "").trim(),
    connections,
    photos: photos.filter((p) => !isFloorplan(p)),
    floorplans: [...photos.filter(isFloorplan), ...units.map((u) => u.floorplan_url).filter((v): v is string => Boolean(v))],
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

export type BrochureContact = {
  name: string | null;
  role: string | null;
  phone: string | null;
  email: string | null;
};

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

export function BrochureView({ client }: { client: PublicClient }) {
  const lang: Lang = client.language === "nl" ? "nl" : "en";
  const t = brochureText(lang);
  const f = useMemo(() => numberFormat(lang), [lang]);
  const buildings = useMemo(() => client.buildings.map((b, i) => toBrochure(b, i, lang, t, f)), [client, lang, t, f]);
  const [geo, setGeo] = useState<Record<string, { lat: number; lng: number } | null>>({});
  const [cityFilter, setCityFilter] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ building: string; index: number } | null>(null);
  const [printing, setPrinting] = useState(false);
  const [solidHeader, setSolidHeader] = useState(false);
  const coverRef = useRef<HTMLElement>(null);

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

  // The header sits on the cover photo, see-through, and turns solid once
  // the cover has scrolled away.
  useEffect(() => {
    const onScroll = () => {
      const cover = coverRef.current;
      setSolidHeader(cover ? window.scrollY > cover.offsetHeight - 72 : window.scrollY > 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const clientName = client.display_name;
  const contact: BrochureContact = {
    name: client.contact_name?.trim() || null,
    role: client.contact_role?.trim() || null,
    phone: client.contact_phone?.trim() || null,
    email: client.contact_email?.trim() || null,
  };
  const viewingHref = (building?: string) =>
    contact.email
      ? `mailto:${contact.email}?subject=${encodeURIComponent(t.viewingSubject(clientName, building))}`
      : contact.phone
        ? telHref(contact.phone)
        : null;
  const preparedByName = contact.name ? `${contact.name}, ${COMPANY}` : COMPANY;
  const updated = formatDate(client.updated_at, lang);
  const allCities = [...new Set(buildings.map((b) => b.city).filter(Boolean))];
  const cities = allCities.length ? listJoin(allCities, lang) : "";
  // The cover shouldn't be the same picture building 01 opens with a scroll
  // later: its second photo, else another building's, else the one there is.
  const heroPhoto =
    buildings[0]?.photos[1] ?? buildings.slice(1).find((b) => b.photos[0])?.photos[0] ?? buildings[0]?.photos[0];

  const mapBuildings: MapBuilding[] = buildings.flatMap((b) => {
    const lat = b.lat ?? geo[b.id]?.lat ?? null;
    const lng = b.lng ?? geo[b.id]?.lng ?? null;
    const available = b.totalAvailable > 0 ? f.area(b.totalAvailable) : t.onRequest;
    return lat != null && lng != null
      ? [{ id: b.id, number: b.number, name: b.name, address: b.address, available, label: available, city: b.city, lat, lng }]
      : [];
  });
  const hasOverview = mapBuildings.length > 0;
  const firstAnchor = hasOverview ? "glance" : buildings[0]?.id;
  const mapCities = [...new Set(mapBuildings.map((b) => b.city).filter(Boolean))];
  const totalAll = buildings.reduce((s, b) => s + b.totalAvailable, 0);
  const lightboxBuilding = lightbox ? buildings.find((b) => b.id === lightbox.building) : undefined;
  const headerCta = viewingHref();

  async function handlePrint() {
    setPrinting(true);
    try {
      await printBrochure();
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div lang={lang} className="brochure min-h-screen bg-background text-foreground">
      <header
        data-solid={solidHeader || undefined}
        className="brochure-header print-hidden fixed inset-x-0 top-0 z-30 text-white transition-[background-color,color,box-shadow] duration-300 data-[solid]:bg-surface/92 data-[solid]:text-foreground data-[solid]:shadow-[0_1px_0_var(--border)] data-[solid]:backdrop-blur-md"
      >
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-3 px-5 sm:gap-5 sm:px-8">
          <a href="#top" aria-label={COMPANY} className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
            <img
              src={LOGO_SRC}
              alt={COMPANY}
              width={332}
              height={80}
              className={`h-6 w-auto transition-[filter] duration-300 sm:h-7 ${solidHeader ? "" : "brochure-logo-reversed"}`}
            />
          </a>
          {buildings.length > 0 && (
            <nav aria-label={t.buildingsNav} className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto sm:flex">
              {buildings.map((b) => (
                <a
                  key={b.id}
                  href={`#${b.id}`}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    solidHeader ? "text-muted hover:bg-input-bg hover:text-foreground" : "text-white/80 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span className="tabular-nums">{b.number}</span>
                  <span className="ml-1.5 hidden xl:inline">{b.name}</span>
                </a>
              ))}
            </nav>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={printing}
              aria-label={t.downloadPdf}
              title={t.downloadPdf}
              className={`inline-flex h-10 items-center gap-2 rounded-full px-3 text-xs font-semibold transition-colors disabled:opacity-60 lg:px-4 ${
                solidHeader ? "hover:bg-input-bg" : "hover:bg-white/10"
              }`}
            >
              <Printer size={15} aria-hidden="true" />
              <span className="hidden lg:inline">{printing ? t.preparing : t.downloadPdf}</span>
            </button>
            {headerCta && (
              <a
                href={headerCta}
                className={`inline-flex h-10 items-center rounded-full px-4 text-xs font-semibold transition-colors sm:px-5 ${
                  solidHeader ? "bg-dark text-white hover:bg-dark/90" : "bg-white text-dark hover:bg-white/90"
                }`}
              >
                {t.planViewing}
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Cover. A building photo carries the page; the client's name is the
          one big type moment. */}
      <section
        id="top"
        ref={coverRef}
        className="brochure-hero relative isolate flex min-h-[86svh] items-end overflow-hidden bg-dark text-white"
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
          className="brochure-hero-scrim absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgb(9_20_48/0.92)_0%,rgb(9_20_48/0.55)_40%,rgb(9_20_48/0.12)_70%,rgb(9_20_48/0.45)_100%)]"
        />
        <div className="brochure-hero-body mx-auto w-full max-w-[1280px] px-5 pb-10 pt-32 sm:px-8 sm:pb-14 lg:pb-16">
          {client.logo_url && (
            <div className="brochure-hero-meta brochure-client-logo mb-8 inline-flex rounded-2xl bg-white px-4 py-3 shadow-[0_10px_30px_-12px_rgb(0_0_0/0.5)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- the client's uploaded logo, a data: URL */}
              <img src={client.logo_url} alt={`${clientName} logo`} className="h-8 w-auto max-w-[200px] object-contain sm:h-10" />
            </div>
          )}
          <p className="brochure-hero-meta text-base text-white/80 sm:text-lg">{t.shortlistFor}</p>
          <h1 className="brochure-hero-title mt-2 overflow-hidden pb-[0.06em]">
            <span className="block font-display text-[clamp(3.25rem,10.5vw,9.5rem)] font-normal leading-[0.95] tracking-[-0.015em] text-balance">
              {clientName}
            </span>
          </h1>
          <div className="brochure-hero-meta mt-8 flex flex-wrap items-center gap-x-8 gap-y-2 border-t border-white/25 pt-5 text-sm text-white/80 print:gap-x-6 print:pt-3 print:text-[10px]">
            <span>{t.countLine(buildings.length, cities)}</span>
            <span>{t.preparedBy(preparedByName)}</span>
            <span>{t.updated(updated)}</span>
            {firstAnchor && (
              <a
                href={`#${firstAnchor}`}
                className="print-hidden inline-flex items-center gap-2 font-medium text-white hover:underline sm:ml-auto"
              >
                {t.seeShortlist} <ArrowDown size={15} aria-hidden="true" />
              </a>
            )}
          </div>
          {/* On paper the contact goes on the cover, where there's room for
              it, instead of on a page of its own at the end. */}
          <div className="hidden print:mt-10 print:flex print:items-end print:justify-between print:gap-8">
            {contact.name || contact.phone || contact.email ? (
              <div>
                <p className="text-[8px] font-semibold uppercase tracking-[0.08em]">{t.yourContact}</p>
                {contact.name && <p className="mt-1.5 font-display text-[26px] leading-none">{contact.name}</p>}
                <p className="mt-1.5 text-[10px]">
                  {[contact.role, COMPANY, contact.phone, contact.email].filter(Boolean).join("  ·  ")}
                </p>
              </div>
            ) : (
              <span />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
            <img src={LOGO_SRC} alt={COMPANY} width={332} height={80} className="h-[9mm] w-auto shrink-0" />
          </div>
        </div>
      </section>

      {buildings.length === 0 && (
        <section className="mx-auto max-w-[1280px] px-5 py-24 sm:px-8">
          <p className="text-base text-muted">{t.empty}</p>
        </section>
      )}

      {hasOverview && (
        <section id="glance" aria-label={t.atAGlance} className="print-break scroll-mt-16 bg-surface">
          <div className="brochure-pad mx-auto max-w-[1280px] px-5 py-16 sm:px-8 sm:py-24">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-[clamp(2.25rem,4.5vw,3.5rem)] leading-none">{t.atAGlance}</h2>
                <p className="mt-3 text-[15px] text-muted print:text-[11px]">
                  {t.whereOffices(buildings.length, cities)}
                  {totalAll > 0 && <> · {t.availableTotal(f.area(totalAll))}</>}
                </p>
              </div>
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
                      {c ?? t.all}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="print-keep mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8 print:mt-5 print:grid-cols-[1fr_62mm] print:gap-4">
              <div className="brochure-map h-[380px] overflow-hidden rounded-[22px] bg-input-bg sm:h-[580px] print:h-[150mm]">
                <ShortlistMap
                  buildings={mapBuildings}
                  city={cityFilter}
                  hoveredId={hoveredId}
                  fitMaxZoom={14}
                  variant="brochure"
                  viewLabel={t.viewBuilding}
                  availableLabel={t.available.toLowerCase()}
                />
              </div>
              <ol className="flex flex-col print:gap-0">
                {mapBuildings.map((m) => {
                  const b = buildings.find((x) => x.id === m.id);
                  const active = hoveredId === m.id;
                  return (
                    <li key={m.id} className="border-b border-border last:border-b-0">
                      <a
                        href={`#${m.id}`}
                        onMouseEnter={() => setHoveredId(m.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        onFocus={() => setHoveredId(m.id)}
                        onBlur={() => setHoveredId(null)}
                        className={`-mx-3 flex items-start gap-4 rounded-2xl px-3 py-4 transition-colors print:mx-0 print:gap-2 print:px-0 print:py-2 ${
                          active ? "bg-input-bg" : "hover:bg-input-bg"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex size-[30px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums text-white transition-colors print:size-5 print:text-[8px] ${
                            active ? "bg-accent" : "bg-dark"
                          }`}
                        >
                          {m.number}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-display text-[23px] leading-[1.1] print:text-sm">{m.name}</span>
                          {b?.area && <span className="mt-1 block text-[13px] text-muted print:text-[9px]">{b.area}</span>}
                        </span>
                        <span className="shrink-0 pt-0.5 text-right">
                          <span className="block text-[15px] font-semibold tabular-nums print:text-[10px]">{m.available}</span>
                          {b && (
                            <span className="mt-0.5 block text-xs text-muted print:text-[8px]">
                              {b.rent.length > 0
                                ? b.rent.map((p) => `${p.from ? `${t.from} ` : ""}${p.amount}${p.per}`).join(" · ")
                                : `${t.rent} ${t.onRequest.toLowerCase()}`}
                            </span>
                          )}
                        </span>
                      </a>
                    </li>
                  );
                })}
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
          t={t}
          f={f}
          signedBy={contact.name}
          viewingHref={viewingHref(b.name)}
          onOpenLightbox={(index) => setLightbox({ building: b.id, index })}
        />
      ))}

      <footer id="contact" className="brochure-footer print-hidden bg-dark text-white">
        {(contact.name || contact.phone || contact.email) && (
          <div className="mx-auto grid max-w-[1280px] gap-10 px-5 pb-4 pt-16 sm:px-8 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end print:px-0 print:pt-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/60">{t.yourContact}</p>
              {contact.name && (
                <p className="brochure-contact-name mt-3 font-display text-[clamp(2.5rem,5vw,4.25rem)] leading-[0.95]">{contact.name}</p>
              )}
              <p className="mt-3 text-[15px] text-white/70">{[contact.role, COMPANY].filter(Boolean).join(" · ")}</p>
              <div className="mt-7 flex flex-wrap gap-x-9 gap-y-3 text-[15px]">
                {contact.phone && (
                  <a href={telHref(contact.phone)} className="inline-flex items-center gap-2.5 font-medium hover:underline">
                    <Phone size={16} aria-hidden="true" className="text-white/60" />
                    {contact.phone}
                  </a>
                )}
                {contact.email && (
                  <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-2.5 font-medium hover:underline">
                    <Mail size={16} aria-hidden="true" className="text-white/60" />
                    {contact.email}
                  </a>
                )}
              </div>
            </div>
            {headerCta && (
              <a
                href={headerCta}
                className="print-hidden inline-flex h-12 items-center justify-center gap-2 self-start rounded-full bg-white px-6 text-sm font-semibold text-dark transition-colors hover:bg-white/90 lg:self-end"
              >
                {t.planViewing} <ArrowRight className="size-4" aria-hidden="true" />
              </a>
            )}
          </div>
        )}
        <div className="mx-auto mt-12 max-w-[1280px] px-5 sm:px-8">
          <div className="flex flex-col gap-5 border-t border-white/15 py-8 sm:flex-row sm:items-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
            <img src={LOGO_SRC} alt={COMPANY} width={332} height={80} className="brochure-logo-reversed h-6 w-auto shrink-0" />
            <p className="max-w-xl text-sm leading-relaxed text-white/60">
              {t.footerLine(clientName, preparedByName)} {t.updated(updated)}.
            </p>
            {buildings.length > 0 && (
              <a href="#top" className="inline-flex shrink-0 items-center gap-2 text-sm font-medium hover:underline sm:ml-auto">
                {t.backToTop} <ArrowRight className="size-4 -rotate-90" aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      </footer>

      {lightbox && lightboxBuilding && (
        <Lightbox
          photos={lightboxBuilding.photos}
          name={lightboxBuilding.name}
          index={lightbox.index}
          t={t}
          onNavigate={(index) => setLightbox({ building: lightbox.building, index })}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

/** "€395–€410" with a smaller "/m²/yr" after it; a building with both
 * direct-lease and flex space gets one line per pricing model. The unit may
 * drop to its own line on a narrow phone column rather than run into the
 * figure next to it. */
function PriceStack({ parts, fromLabel, large = false }: { parts: PricePart[]; fromLabel: string; large?: boolean }) {
  return (
    <span className="flex flex-col gap-0.5">
      {parts.map((p) => (
        <span key={p.per} className="sm:whitespace-nowrap print:whitespace-normal">
          {p.from && <span className={`mr-1 font-normal text-muted ${large ? "text-sm" : "text-xs"}`}>{fromLabel}</span>}
          <span className="whitespace-nowrap">{p.amount}</span>
          <span className={`ml-0.5 inline-block font-normal text-muted ${large ? "text-sm sm:text-base" : "text-xs"}`}>{p.per}</span>
        </span>
      ))}
    </span>
  );
}

function Lightbox({
  photos,
  name,
  index,
  t,
  onNavigate,
  onClose,
}: {
  photos: string[];
  name: string;
  index: number;
  t: BrochureText;
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
  const control =
    "rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/20 focus-visible:outline-white";
  return (
    <div
      className="print-hidden fixed inset-0 z-50 flex flex-col bg-[rgb(8_13_26/0.96)] text-white"
      role="dialog"
      aria-modal="true"
      aria-label={t.allPhotosOf(name)}
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
          {name} <span className="ml-2 text-xs font-medium tabular-nums text-white/55">{index + 1} / {photos.length}</span>
        </p>
        <button type="button" onClick={onClose} aria-label={t.closeGallery} autoFocus className={control}>
          <X size={17} />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-5 pb-5 sm:px-20">
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary captured URLs, no fixed domain to allowlist */}
        <img src={photos[index]} alt={t.photoOf(name, index + 1)} className="max-h-full max-w-full rounded-lg object-contain" />
        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label={t.previousPhoto}
              className={`absolute left-3 top-1/2 -translate-y-1/2 sm:left-6 ${control}`}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label={t.nextPhoto}
              className={`absolute right-3 top-1/2 -translate-y-1/2 sm:right-6 ${control}`}
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
              aria-label={t.photo(i + 1)}
              aria-current={i === index}
              className={`h-14 w-20 shrink-0 overflow-hidden rounded-md border-2 transition ${
                i === index ? "border-white" : "border-transparent opacity-50 hover:opacity-100"
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
function FloorPlans({ urls, name, t }: { urls: string[]; name: string; t: BrochureText }) {
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const working = urls.filter((u) => !broken.has(u));
  if (working.length === 0) return null;
  return (
    <div className="brochure-floorplans print-keep mt-14 print:mt-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted print:text-[8px]">{t.floorPlan}</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:mt-1.5 print:grid-cols-2 print:gap-2">
        {working.map((u) => (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary captured URLs, no fixed domain to allowlist
          <img
            key={u}
            src={u}
            alt={t.floorPlanOf(name)}
            loading="lazy"
            onError={() => setBroken((prev) => new Set(prev).add(u))}
            className="aspect-[1.4] w-full rounded-lg border border-border bg-surface object-contain print:h-[30mm] print:aspect-auto"
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
  t,
  f,
  signedBy,
  viewingHref,
  onOpenLightbox,
}: {
  building: Brochure;
  next: Brochure | undefined;
  total: number;
  t: BrochureText;
  f: Fmt;
  signedBy: string | null;
  viewingHref: string | null;
  onOpenLightbox: (index: number) => void;
}) {
  const leadRef = useReveal<HTMLDivElement>();
  const morePhotos = b.photos.slice(1, 3);

  // The five figures a client compares buildings on, in the same order
  // every time. A missing figure is set smaller and muted, so it never
  // outweighs the numbers next to it.
  const quiet = (text: string) => <span className="text-lg font-normal text-muted sm:text-xl print:text-sm">{text}</span>;
  const priced = (parts: PricePart[], fallback: string) =>
    parts.length ? <PriceStack parts={parts} fromLabel={t.from} large /> : quiet(fallback);
  const figures: [string, React.ReactNode][] = [
    [t.rent, priced(b.rent, t.onRequest)],
    [t.serviceCharges, priced(b.service, b.serviceFallback)],
    [t.available, b.totalAvailable > 0 ? priced([{ amount: f.num(b.totalAvailable), per: "m²" }], "") : quiet(t.onRequest)],
    [t.parkingRatio, b.parking ?? quiet("—")],
    [t.parking, priced(b.parkingPrice, t.onRequest)],
  ];
  // Details a client asks about; anything not known is left out rather than
  // shown as a dash.
  const energy = energyColor(b.energy);
  const details = (
    [
      [t.rentableFrom, b.divisibleFrom],
      [t.delivery, b.delivery],
      [t.availableFrom, b.availability],
      [
        t.energyLabel,
        b.energy ? (
          <span
            className="inline-flex h-[24px] min-w-[24px] items-center justify-center rounded-md px-1.5 text-xs font-bold"
            style={{ background: energy?.bg ?? "var(--input-bg)", color: energy?.fg ?? "var(--foreground)" }}
          >
            {b.energy}
          </span>
        ) : null,
      ],
      [t.yearBuilt, b.yearBuilt],
      [t.buildingArea, b.buildingArea],
      [t.breeam, b.breeam],
    ] as [string, React.ReactNode][]
  ).filter(([, v]) => v !== null && v !== "");
  const maxFloorArea = Math.max(1, ...b.floors.map((fl) => fl.area));
  const hasYearly = b.floors.some((fl) => fl.yearly !== null);
  const hasLeft = b.floors.length > 0 || details.length > 0;
  const hasRight = Boolean(b.description) || b.amenities.length > 0 || b.connections.length > 0;
  const capsLabel = "text-[11px] font-semibold uppercase tracking-[0.08em] text-muted print:text-[8px]";

  return (
    <section id={b.id} aria-labelledby={`${b.id}-name`} className="brochure-building print-break scroll-mt-16 border-t border-border bg-surface">
      <div className="brochure-pad mx-auto max-w-[1280px] px-5 pt-16 sm:px-8 sm:pt-24">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-sm text-muted">
          <span>
            <span className="font-semibold tabular-nums text-accent">{b.number}</span>
            <span className="tabular-nums">
              {" "}
              {t.of} {pad(total)}
            </span>
          </span>
          {b.area && <span>{b.area}</span>}
        </div>
        <h2
          id={`${b.id}-name`}
          className="mt-4 font-display text-[clamp(2.75rem,7vw,6.25rem)] font-normal leading-[0.95] tracking-[-0.01em] text-balance print:mt-1.5 print:text-[34px]"
        >
          {b.name}
        </h2>
        <p className="mt-4 text-base text-muted print:mt-1.5 print:text-xs">{b.address}</p>
      </div>

      {b.photos[0] && (
        <div ref={leadRef} className="brochure-reveal brochure-lead-photo mt-10 sm:mt-14 print:mt-4">
          <button
            type="button"
            onClick={() => onOpenLightbox(0)}
            aria-label={t.openPhotos(b.name)}
            className="block w-full cursor-zoom-in"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary captured URLs, no fixed domain to allowlist */}
            <img src={b.photos[0]} alt={b.name} className="h-[66vw] max-h-[82vh] w-full object-cover sm:h-[52vw]" />
          </button>
        </div>
      )}

      <div className="brochure-pad mx-auto max-w-[1280px] px-5 pb-20 sm:px-8 sm:pb-28">
        <dl className="print-keep grid grid-cols-2 gap-x-4 gap-y-8 border-b border-border py-8 sm:grid-cols-3 sm:py-10 lg:grid-cols-5 print:grid-cols-5 print:gap-y-2 print:py-3">
          {figures.map(([label, value], i) => (
            <div key={label} className={`min-w-0 ${i > 0 ? "lg:border-l lg:border-border lg:pl-7 print:border-l print:border-border print:pl-3" : ""}`}>
              <dt className={capsLabel}>{label}</dt>
              <dd className="mt-2.5 text-[22px] font-medium leading-tight tracking-[-0.02em] tabular-nums sm:text-[32px] print:mt-1 print:text-[15px]">
                {value}
              </dd>
            </div>
          ))}
        </dl>

        {(b.brokerNote || b.watchOut) && (
          <div
            className={`brochure-advice print-keep mt-12 grid gap-8 rounded-[22px] bg-input-bg p-6 sm:p-9 print:mt-4 print:gap-5 print:rounded-xl print:p-4 ${
              b.brokerNote && b.watchOut ? "lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-14 print:grid-cols-[1.5fr_1fr]" : ""
            }`}
          >
            {b.brokerNote && (
              <div>
                <h3 className={`${capsLabel} !text-accent`}>{t.whyOnList}</h3>
                <p className="mt-4 whitespace-pre-line font-display text-[clamp(1.5rem,2.5vw,2.125rem)] leading-[1.2] text-foreground print:mt-1.5 print:text-[15px]">
                  {b.brokerNote}
                </p>
                {signedBy && <p className="mt-4 text-sm text-muted print:mt-1.5 print:text-[9px]">— {signedBy}</p>}
              </div>
            )}
            {b.watchOut && (
              <div className={b.brokerNote ? "lg:border-l lg:border-border lg:pl-14 print:border-l print:border-border print:pl-5" : ""}>
                <h3 className={capsLabel}>{t.pointsToConsider}</h3>
                <p className="mt-4 whitespace-pre-line text-[17px] leading-relaxed text-foreground/90 print:mt-1.5 print:text-[10px]">
                  {b.watchOut}
                </p>
              </div>
            )}
          </div>
        )}

        {(hasLeft || hasRight) && (
          <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-[72px] print:mt-4 print:grid-cols-[1.15fr_1fr] print:gap-7">
            <div className="min-w-0">
              {b.floors.length > 0 && (
                <div>
                  <h3 className={capsLabel}>
                    {t.perFloor}
                    {b.totalAvailable > 0 && (
                      <span className="ml-2.5 font-medium normal-case tracking-normal">{t.inTotal(f.area(b.totalAvailable))}</span>
                    )}
                  </h3>
                  <ol className="mt-3 border-t border-border print:mt-1.5">
                    {b.floors.map((fl) => (
                      <li key={fl.key} className="brochure-floor print-keep border-b border-border py-3.5 print:py-[1.3mm]">
                        <div className="flex items-start gap-4 print:items-baseline print:gap-3">
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-semibold print:inline print:text-[9.5px]">{fl.label}</span>
                            {fl.note && (
                              <span className="mt-0.5 block text-[13px] text-muted print:ml-2 print:mt-0 print:inline print:text-[8px]">
                                {fl.note}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-right print:flex print:flex-row-reverse print:items-baseline print:gap-3">
                            <span className="whitespace-nowrap">
                              <span className="text-[22px] font-semibold leading-none tracking-[-0.02em] tabular-nums print:text-[11px]">
                                {f.num(fl.area)}
                              </span>
                              <span className="ml-1 text-[13px] text-muted print:text-[8px]">m²</span>
                            </span>
                            {(fl.rent || fl.yearly !== null) && (
                              <span className="mt-1.5 block text-xs tabular-nums text-muted print:mt-0 print:text-[8px]">
                                {fl.rent && (
                                  <>
                                    {fl.rent.from ? `${t.from} ` : ""}
                                    {fl.rent.amount}
                                    {fl.rent.per}
                                  </>
                                )}
                                {fl.rent && fl.yearly !== null && " · "}
                                {fl.yearly !== null && (
                                  <span className="font-medium text-foreground">
                                    ≈ {f.money(fl.yearly)}
                                    {t.perYear}
                                  </span>
                                )}
                              </span>
                            )}
                          </span>
                        </div>
                        <span aria-hidden="true" className="mt-2.5 block h-[3px] rounded-full bg-input-bg print:hidden">
                          <span
                            className="block h-full rounded-full bg-dark/75"
                            style={{ width: `${Math.max(4, (fl.area / maxFloorArea) * 100)}%` }}
                          />
                        </span>
                      </li>
                    ))}
                  </ol>
                  {hasYearly && <p className="mt-3 text-xs leading-relaxed text-muted print:mt-1 print:text-[7px]">{t.yearlyNote}</p>}
                </div>
              )}
              {details.length > 0 && (
                <div className={b.floors.length > 0 ? "mt-10 print:mt-4" : ""}>
                  <h3 className={capsLabel}>{t.details}</h3>
                  <dl className="mt-3.5 grid grid-cols-2 gap-x-8 print:mt-1.5 print:grid-cols-4 print:gap-x-4">
                    {details.map(([label, value]) => (
                      <div key={label} className="border-t border-border py-3 print:py-1">
                        <dt className="text-[13px] text-muted print:text-[8px]">{label}</dt>
                        <dd className="mt-1 text-base font-medium print:mt-0 print:text-[10px]">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </div>
            {hasRight && (
              <div className="min-w-0">
                {b.description && (
                  <p className="max-w-[62ch] whitespace-pre-line text-lg leading-[1.65] text-foreground/90 sm:text-xl print:text-[10px] print:leading-[1.5]">
                    {b.description}
                  </p>
                )}
                {b.amenities.length > 0 && (
                  <div className={b.description ? "mt-9 print:mt-3" : ""}>
                    <h3 className={capsLabel}>{t.amenities}</h3>
                    <ul aria-label={t.amenities} className="mt-3.5 flex flex-wrap gap-2 print:mt-1.5 print:gap-1">
                      {b.amenities.map((a) => (
                        <li key={a} className="rounded-full border border-border px-3.5 py-1.5 text-sm print:px-2 print:py-0.5 print:text-[8px]">
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {b.connections.length > 0 && (
                  <div className={b.description || b.amenities.length > 0 ? "mt-9 print:mt-3" : ""}>
                    <h3 className={capsLabel}>{t.gettingThere}</h3>
                    <dl className="mt-3.5 border-b border-border print:mt-1.5">
                      {b.connections.map((c) => (
                        <div
                          key={c.label}
                          className="grid grid-cols-[minmax(96px,auto)_minmax(0,1fr)_auto] items-baseline gap-3 border-t border-border py-3.5 text-[15px] sm:grid-cols-[140px_minmax(0,1fr)_auto] print:grid-cols-[22mm_1fr_auto] print:py-1 print:text-[9px]"
                        >
                          <dt className="text-muted">{c.label}</dt>
                          <dd className="m-0 min-w-0">{c.place}</dd>
                          <dd className="m-0 text-right font-semibold tabular-nums">{c.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
                {/* On paper the floor plan sits in this column, where there's
                    room, rather than spilling onto a page of its own. */}
                <div className="hidden print:block">
                  <FloorPlans urls={b.floorplans} name={b.name} t={t} />
                </div>
              </div>
            )}
          </div>
        )}

        {morePhotos.length > 0 && (
          <div className="brochure-more-photos print-hidden mt-14 grid grid-cols-2 gap-2">
            {morePhotos.map((src, n) => (
              <button
                key={src}
                type="button"
                onClick={() => onOpenLightbox(n + 1)}
                aria-label={t.openPhoto(n + 2, b.name)}
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
            <Images size={15} className="text-accent" aria-hidden="true" /> {t.viewAllPhotos(b.photos.length)}
          </button>
        )}

        <div className={hasRight ? "print-hidden" : ""}>
          <FloorPlans urls={b.floorplans} name={b.name} t={t} />
        </div>

        <div className="print-hidden mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
          {viewingHref ? (
            <a href={viewingHref} className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline">
              {t.planViewing}
            </a>
          ) : (
            <span />
          )}
          {next ? (
            <a href={`#${next.id}`} className="group inline-flex items-center gap-3 text-sm">
              <span className="text-muted">{t.next}</span>
              <span className="font-display text-xl group-hover:text-accent">{next.name}</span>
              <ArrowRight className="size-4 text-accent transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </a>
          ) : (
            <a href="#top" className="inline-flex items-center gap-2 text-sm font-medium text-accent">
              {t.backToCover} <ArrowRight className="size-4 -rotate-90" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
