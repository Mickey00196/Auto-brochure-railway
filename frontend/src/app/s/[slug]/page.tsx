import { notFound } from "next/navigation";
import { ArrowDown, ArrowRight, Building2, Check, MapPin } from "lucide-react";
import type { PublicBuilding, PublicClient } from "@/lib/types";
import { INTERNAL_API_BASE_URL } from "@/lib/serverApi";
import { formatArea } from "@/lib/format";

/** A client's shareable live link — the one page in this app a visitor with
 * no account can open (see proxy.ts and NavBar.tsx). Fetched straight from
 * the backend's unauthenticated /public/clients/{slug}, never through
 * serverApi (every other call there assumes a logged-in broker). Laid out
 * to match the approved Lovable brochure design 1:1 — see
 * src/routes/brochure/demo.tsx in the design sandbox — with real captured
 * photos and data standing in for its placeholder blocks. */
async function getPublicClient(slug: string): Promise<PublicClient | null> {
  try {
    const res = await fetch(`${INTERNAL_API_BASE_URL}/public/clients/${slug}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as PublicClient;
  } catch {
    return null;
  }
}

function buildingStats(b: PublicBuilding) {
  const totalAvailable = b.units.reduce((sum, u) => sum + (u.available_area_m2 ?? 0), 0);
  const rents = b.units.map((u) => u.rent_eur_per_m2_year).filter((r): r is number => typeof r === "number");
  const serviceCharges = b.units
    .map((u) => u.service_charge_eur_per_m2_year)
    .filter((r): r is number => typeof r === "number");
  const range = (values: number[]) =>
    values.length === 0
      ? "On request"
      : Math.min(...values) === Math.max(...values)
        ? `€${Math.min(...values).toLocaleString("en-US")}`
        : `€${Math.min(...values).toLocaleString("en-US")}–€${Math.max(...values).toLocaleString("en-US")}`;
  const availability = b.units.find((u) => u.availability)?.availability ?? "On request";
  return {
    areaLabel: totalAvailable > 0 ? formatArea(totalAvailable) : "On request",
    rentLabel: range(rents),
    serviceLabel: range(serviceCharges),
    availability,
  };
}

export default async function PublicClientPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const client = await getPublicClient(slug);
  if (!client) notFound();

  const buildings = client.buildings;
  const heroPhoto = buildings.find((b) => b.photos.length > 0)?.photos[0];
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

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
        <div className="sticky top-16 z-20 border-b border-border bg-surface/95 backdrop-blur-sm">
          <div className="mx-auto flex min-h-11 max-w-[1180px] items-center gap-2 px-5 sm:px-8">
            <a href="#top" className="shrink-0 text-[11px] font-semibold text-foreground hover:text-accent">
              {client.display_name} <span className="text-muted">/</span> Shortlist
            </a>
            <nav aria-label="Building contents" className="ml-auto flex min-w-0 items-center gap-1 overflow-x-auto sm:gap-2">
              {buildings.map((b, i) => (
                <a
                  key={b.building_id}
                  href={`#b-${i}`}
                  className="shrink-0 rounded-lg px-2 py-2 text-[11px] font-medium text-muted transition-colors hover:bg-input-bg hover:text-dark sm:px-3 sm:text-xs"
                >
                  <span className="mr-1 text-accent">{String(i + 1).padStart(2, "0")}</span>
                  <span className="hidden md:inline">{b.name}</span>
                  <span className="md:hidden">{b.name.split(" ")[0]}</span>
                </a>
              ))}
            </nav>
          </div>
        </div>
      )}

      <section id="top" className="relative overflow-hidden bg-dark text-white">
        <div className="mx-auto grid min-h-[480px] max-w-[1440px] items-center gap-10 px-5 py-16 sm:px-10 lg:min-h-[560px] lg:grid-cols-[1fr_0.85fr] lg:px-16 lg:py-24">
          <div className="relative z-10 max-w-[650px]">
            <p className="mb-8 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">
              Office shortlist <span className="mx-3">/</span> {buildings[0]?.city ?? "Your shortlist"}
            </p>
            <h1 className="max-w-[620px] text-5xl font-medium leading-[1.05] sm:text-6xl">{client.display_name}</h1>
            <p className="mt-7 max-w-md text-base leading-relaxed text-white/75 sm:text-lg">
              {buildings.length} building{buildings.length === 1 ? "" : "s"} selected for you.
            </p>
            <div className="mt-14 grid max-w-[480px] grid-cols-2 gap-x-8 gap-y-5 border-t border-white/25 pt-6 text-sm">
              <div>
                <div className="text-[10px] uppercase tracking-[0.13em] text-white/55">Prepared for</div>
                <div className="mt-1 font-medium">{client.display_name}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.13em] text-white/55">Date</div>
                <div className="mt-1 font-medium">{today}</div>
              </div>
            </div>
            {buildings.length > 0 && (
              <a href="#b-0" className="mt-12 inline-flex items-center gap-2 text-xs font-semibold hover:underline">
                Explore the shortlist <ArrowDown size={15} />
              </a>
            )}
          </div>
          <div className="relative hidden min-h-[380px] self-stretch lg:block" aria-hidden="true">
            {heroPhoto && (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary captured URLs, no fixed domain to allowlist
              <img
                src={heroPhoto}
                alt=""
                className="absolute inset-x-[5%] top-[5%] h-[80%] w-[90%] rotate-[-3deg] rounded-sm object-cover opacity-90 shadow-lg"
              />
            )}
            <div className="absolute bottom-10 left-2 border-l border-white/40 pl-4 text-xs uppercase tracking-[0.14em] text-white/70">
              {String(buildings.length).padStart(2, "0")} building{buildings.length === 1 ? "" : "s"}
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
              {buildings.map((b, i) => {
                const stats = buildingStats(b);
                return (
                  <a
                    key={b.building_id}
                    href={`#b-${i}`}
                    className="group flex items-start gap-4 border-t border-border py-5 first:sm:border-l-0 first:sm:pl-0 sm:border-l sm:border-t-0 sm:px-6 sm:py-1"
                  >
                    <span className="text-xs font-semibold text-accent">{String(i + 1).padStart(2, "0")}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold group-hover:text-accent">{b.name}</div>
                      <div className="mt-1 text-xs text-muted">{stats.areaLabel} available</div>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        </section>
      ) : (
        <section className="mx-auto max-w-[1180px] px-5 py-20 text-center sm:px-10">
          <p className="text-sm text-muted">No buildings have been added to this shortlist yet.</p>
        </section>
      )}

      {buildings.map((b, i) => (
        <BuildingSection key={b.building_id} building={b} index={i} buildings={buildings} />
      ))}

      <footer className="bg-dark px-5 py-12 text-white sm:px-10 lg:px-16">
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
            <a href="#top" className="inline-flex items-center gap-2 text-xs font-medium hover:underline">
              Back to top <ArrowRight className="size-4 -rotate-90" />
            </a>
          )}
        </div>
      </footer>
    </div>
  );
}

function BuildingSection({
  building: b,
  index,
  buildings,
}: {
  building: PublicBuilding;
  index: number;
  buildings: PublicBuilding[];
}) {
  const stats = buildingStats(b);
  const next = buildings[index + 1];
  const connections = [
    ["Highway", b.accessibility_note],
    ["Airport", b.airport_note],
    ["Public transport", b.public_transport_note],
  ].filter((pair): pair is [string, string] => Boolean(pair[1]));

  return (
    <section id={`b-${index}`} className={`scroll-mt-28 border-b border-border ${index % 2 === 0 ? "bg-background" : "bg-surface"}`}>
      <div className="mx-auto max-w-[1180px] px-5 py-14 sm:px-10 sm:py-20 lg:px-16">
        <div className="mb-8 flex items-center justify-between border-b border-border pb-4 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted">
          <span>
            Property {index + 1} / {buildings.length}
          </span>
          <span>{b.city}</span>
        </div>

        <div className="mb-9 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            {b.submarket && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-accent">
                <MapPin size={13} />
                {b.submarket}
              </p>
            )}
            <h2 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">{b.name}</h2>
            <p className="mt-3 text-sm text-muted">
              {b.address}
              {b.postal_code ? `, ${b.postal_code}` : ""} {b.city}
            </p>
          </div>
          {b.energy_label && (
            <div className="w-fit rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] font-medium">
              {b.energy_label} energy label
            </div>
          )}
        </div>

        <div className="grid gap-2 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,0.8fr)]">
          <div className="relative aspect-[1.55] min-w-0 overflow-hidden rounded-xl bg-input-bg lg:aspect-auto lg:min-h-[420px]">
            {b.photos[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.photos[0]} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted">No photo</div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            {b.photos.slice(1, 3).map((p) => (
              <div key={p} className="relative aspect-[1.4] overflow-hidden rounded-xl bg-input-bg lg:aspect-auto">
                {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary captured URLs, no fixed domain to allowlist */}
                <img src={p} alt="" className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-y-6 border-y border-border py-7 sm:grid-cols-3 lg:grid-cols-5">
          {[
            ["Available area", stats.areaLabel],
            ["Rent / m² / yr", stats.rentLabel],
            ["Service / m² / yr", stats.serviceLabel],
            ["Energy label", b.energy_label ?? "On request"],
            ["Availability", stats.availability],
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
            {b.building_amenities.length > 0 && (
              <div className="mt-7 flex flex-wrap gap-2">
                {b.building_amenities.map((a) => (
                  <span
                    key={a}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] font-medium"
                  >
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

        <div className="mt-20 flex justify-end border-t border-border pt-6">
          {next ? (
            <a href={`#b-${index + 1}`} className="group inline-flex items-center gap-3 text-xs font-semibold text-accent">
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
