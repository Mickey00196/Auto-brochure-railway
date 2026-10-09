import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Car, ChevronLeft, ExternalLink, Pencil, Plane, Train } from "lucide-react";
import type { AddOn, Building, ClientCopy, Unit } from "@/lib/types";
import { serverApi as api } from "@/lib/serverApi";
import { AddOnForm } from "@/components/AddOnForm";
import { BuildingActions } from "@/components/BuildingActions";
import { BuildingPhotoMosaic } from "@/components/BuildingPhotoMosaic";
import { formatPriceParts, isFlexOnly, rentParts, serviceChargeParts } from "@/lib/format";
import { floorRank } from "@/lib/floors";
import { energyColor } from "@/lib/energy";
import { splitDistance } from "@/lib/distance";

/** Clicking a building in the library lands here: the building as a listing
 * page — photos, the five figures a broker compares on, its spaces per floor,
 * the rest, and how to get there — with Edit, PDF and Add to client on top.
 * Changing the building's own details happens on /buildings/[id]/edit; each
 * space has its own edit page, opened from the floor stack. */

const DELIVERY: Record<string, string> = {
  turn_key: "Turn-key",
  shell_and_core: "Shell & core",
  shell_and_core_plus: "Shell & core plus",
  mixed: "Mixed",
};

const nf = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 0 });
const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });
const shortDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Amsterdam" });

const card = "min-w-0 rounded-[20px] bg-surface shadow-card";
const h2 = "text-lg font-semibold tracking-[-0.02em]";

function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "?";
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

type Figure = { label: string; value: string | null; per?: string };

function keyFigures(building: Building, addons: AddOn[]): Figure[] {
  const units = building.units;
  const rent = rentParts(units);
  const service = serviceChargeParts(units);
  const area = units.reduce((sum, u) => sum + (u.available_area_m2 ?? 0), 0);
  const parking = addons.find((a) => /parking|parkeer/i.test(a.name));
  const parkingPer = parking
    ? /month|maand/i.test(parking.price_unit)
      ? "/space/mo"
      : /year|jaar/i.test(parking.price_unit)
        ? "/space/yr"
        : `/${parking.price_unit.replace(/^EUR\s*\/\s*/i, "").replace(/\s+/g, "")}`
    : undefined;
  return [
    rent.length === 1
      ? { label: "Rent office space", value: rent[0].amount, per: rent[0].per }
      : rent.length > 1
        ? { label: "Rent office space", value: formatPriceParts(rent) }
        : { label: "Rent office space", value: units.some((u) => u.rent_price_type === "on_request") ? "On request" : null },
    service.length
      ? { label: "Service charges", value: service[0].amount, per: service[0].per }
      : { label: "Service charges", value: isFlexOnly(units) ? "Included" : null },
    { label: "Total surface available", value: area > 0 ? nf(area) : null, per: "m²" },
    { label: "Parking ratio", value: units.find((u) => u.parking_ratio)?.parking_ratio ?? null },
    { label: "Rent parking space", value: parking ? `€${nf(parking.price)}` : null, per: parkingPer },
  ];
}

function EnergyBadge({ label, size = "md" }: { label: string; size?: "sm" | "md" }) {
  const c = energyColor(label);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md font-bold ${
        size === "sm" ? "h-[18px] min-w-[18px] px-1 text-[10px]" : "h-[26px] min-w-[26px] px-1.5 text-[13px]"
      }`}
      style={{ background: c?.bg ?? "var(--input-bg)", color: c?.fg ?? "var(--foreground)" }}
    >
      {label}
    </span>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-[13px] font-medium">
      {children}
    </span>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 border-t border-input-bg py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="m-0 mt-1 text-[15px] font-medium">{children ?? <span className="font-normal text-placeholder">Not known</span>}</dd>
    </div>
  );
}

function Distance({ icon, label, note }: { icon: ReactNode; label: string; note: string | null }) {
  const { place, value } = splitDistance(note ?? "");
  return (
    <div className="flex flex-1 items-center gap-4 rounded-2xl bg-background px-4 py-4 sm:px-5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface text-accent" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-muted">{label}</span>
        <span className={`mt-0.5 line-clamp-2 block text-[15px] font-medium leading-snug ${place ? "" : "text-placeholder"}`}>
          {place || (note ? "" : "Not known")}
        </span>
      </span>
      {value && <span className="shrink-0 text-[26px] font-semibold tracking-[-0.02em] tabular-nums">{value}</span>}
    </div>
  );
}

/** "Per direct" → "Available per direct", "Q4 2026" → "Available from Q4 2026". */
function availableLabel(value: string): string {
  if (/^available\b/i.test(value)) return value;
  if (/^(per|from|vanaf|in|direct)\b/i.test(value)) return `Available ${value.charAt(0).toLowerCase()}${value.slice(1)}`;
  return `Available from ${value}`;
}

function unitNote(u: Unit): string {
  const avail = u.availability && !/^(tbd|n\/?a)$/i.test(u.availability.trim()) ? u.availability : "Availability TBD";
  const parts = [avail, DELIVERY[u.delivery_condition] ?? null];
  if (u.pricing_model === "per_desk_monthly" && u.desk_count) parts.push(`${u.desk_count} desks`);
  return parts.filter(Boolean).join(" · ");
}

export default async function BuildingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [building, addons, copies] = await Promise.all([
    api.building(id).catch(() => null),
    api.addons({ buildingId: id }).catch(() => [] as AddOn[]),
    api.clientCopies(id).catch(() => [] as ClientCopy[]),
  ]);
  if (!building) notFound();
  const owner = building.client_id ? await api.client(building.client_id).catch(() => null) : null;

  const units = building.units;
  const figures = keyFigures(building, addons);
  const totalArea = units.reduce((sum, u) => sum + (u.available_area_m2 ?? 0), 0);
  const minDivisible = units.map((u) => u.min_divisible_area_m2).filter((v): v is number => typeof v === "number" && v > 0);
  const rentableFrom = minDivisible.length ? Math.min(...minDivisible) : null;
  const deliveries = [...new Set(units.map((u) => DELIVERY[u.delivery_condition]).filter(Boolean))];
  const availability = units.find((u) => u.availability)?.availability ?? null;
  const allHaveFloors = units.length > 0 && units.every((u) => u.floor);
  // Top floor first, so the stack reads like the building itself.
  const stack = [...units].sort((a, b) => floorRank(b.floor ?? "") - floorRank(a.floor ?? ""));
  const photos = building.photos ?? [];
  const sourceHost = hostOf(building.source_url);
  const mapQuery =
    building.latitude != null && building.longitude != null
      ? `${building.latitude},${building.longitude}`
      : [building.address, building.postal_code, building.city].filter(Boolean).join(", ");
  const where = [building.address, [building.postal_code, building.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={building.client_id ? `/clients/${building.client_id}` : "/buildings"}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground"
        >
          <ChevronLeft size={15} aria-hidden="true" />
          {building.client_id ? (owner?.display_name ?? "Client folder") : "Library"}
        </Link>
        <div className="ml-auto">
          <BuildingActions
            buildingId={building.building_id}
            buildingName={building.name}
            isClientCopy={Boolean(building.client_id)}
            clientId={building.client_id}
            alreadyIn={copies.map((c) => c.client_id)}
          />
        </div>
      </div>

      <div className="mt-[18px]">
        <BuildingPhotoMosaic photos={photos} />
      </div>

      <div className="mt-7 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[44px]">{building.name}</h1>
          {where && where !== building.name && <p className="mt-2 text-base text-muted">{where}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {building.submarket && <Chip>{building.submarket}</Chip>}
            {deliveries.length === 1 && <Chip>{deliveries[0]}</Chip>}
            {building.energy_label && (
              <Chip>
                <EnergyBadge label={building.energy_label} size="sm" />
                Energy {building.energy_label}
              </Chip>
            )}
            {building.year_built && <Chip>Built {building.year_built}</Chip>}
            {availability && !/^(tbd|n\/?a)$/i.test(availability.trim()) && <Chip>{availableLabel(availability)}</Chip>}
          </div>
        </div>

        {building.client_id ? (
          <div className="flex items-center gap-3 rounded-2xl bg-surface py-2.5 pl-3 pr-4 shadow-[0_1px_2px_rgba(15,27,51,0.06)]">
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-white">
              {initials(owner?.display_name ?? "?")}
            </span>
            <span>
              <span className="block text-[13px] font-semibold">In {owner?.display_name ?? "a client"}&apos;s folder</span>
              <span className="block text-xs text-muted">
                Their own copy; changes here don&apos;t touch the library.
                {building.source_building_id && (
                  <>
                    {" "}
                    <Link href={`/buildings/${building.source_building_id}`} className="font-medium text-accent hover:underline">
                      Open the original
                    </Link>
                  </>
                )}
              </span>
            </span>
          </div>
        ) : copies.length > 0 ? (
          <div className="flex items-center gap-3 rounded-2xl bg-surface py-2.5 pl-3 pr-4 shadow-[0_1px_2px_rgba(15,27,51,0.06)]">
            <span className="flex">
              {copies.slice(0, 3).map((c, i) => (
                <span
                  key={c.building_id}
                  className={`flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 border-background text-[11px] font-semibold text-white ${
                    i === 0 ? "bg-accent" : i === 1 ? "-ml-2 bg-dark" : "-ml-2 bg-muted"
                  }`}
                >
                  {initials(c.display_name)}
                </span>
              ))}
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold">
                In {copies.length} client folder{copies.length === 1 ? "" : "s"}
              </span>
              <span className="block max-w-[320px] truncate text-xs text-muted">
                {copies.map((c, i) => (
                  <span key={c.building_id}>
                    {i > 0 && ", "}
                    <Link href={`/clients/${c.client_id}`} className="hover:text-accent hover:underline" title={c.copied_at ? `Added ${shortDay(c.copied_at)}` : undefined}>
                      {c.display_name}
                    </Link>
                  </span>
                ))}
              </span>
            </span>
          </div>
        ) : (
          <p className="text-[13px] text-muted">Not in any client folder yet</p>
        )}
      </div>

      <section aria-labelledby="b-key" className="mt-8">
        <h2 id="b-key" className={h2}>
          Key figures
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(190px,1fr))] sm:gap-3">
          {figures.map((f) => (
            <div key={f.label} className={`${card} rounded-[18px] px-[18px] pb-[15px] pt-4`}>
              <span className="block text-xs text-muted">{f.label}</span>
              <span className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5">
                {f.value ? (
                  <>
                    {/^from /.test(f.value) && <span className="text-[13px] font-medium text-muted">from</span>}
                    <span className="whitespace-nowrap text-[22px] font-semibold tracking-[-0.025em] tabular-nums sm:text-[28px]">{f.value.replace(/^from /, "")}</span>
                    {f.per && <span className="text-xs text-muted">{f.per}</span>}
                  </>
                ) : (
                  <span className="text-[22px] font-semibold tracking-[-0.025em] text-placeholder sm:text-[28px]">TBD</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="b-spaces" className={`${card} mt-5 p-5 sm:p-7`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
          <h2 id="b-spaces" className={h2}>
            {allHaveFloors ? "Available per floor" : "Available spaces"}
          </h2>
          {totalArea > 0 && (
            <span className="text-[13px] text-muted tabular-nums">
              {nf(totalArea)} m² in total{rentableFrom && rentableFrom < totalArea ? `, rentable from ${nf(rentableFrom)} m²` : ""}
            </span>
          )}
        </div>
        <div className="mt-4 flex flex-col gap-1.5">
          <Link
            href={`/buildings/${building.building_id}/units/new`}
            className="flex h-11 items-center justify-center rounded-[10px] border-[1.5px] border-dashed border-border text-sm font-medium text-muted transition hover:border-accent hover:text-accent"
          >
            + Add space
          </Link>
          {stack.length === 0 && (
            <p className="py-3 text-center text-sm text-muted">
              No spaces yet. Add one so this building shows an area and rent in a client PDF.
            </p>
          )}
          {stack.map((u, pos) => {
            // Darkest at street level, a touch lighter for each floor up.
            const shade = Math.max(55, 100 - (stack.length - 1 - pos) * 12);
            return (
              <Link
                key={u.unit_id}
                href={`/buildings/${building.building_id}/units/${u.unit_id}/edit`}
                className="group flex min-h-16 items-center gap-3 rounded-[10px] px-4 py-2 text-accent-foreground transition hover:brightness-110 sm:gap-3.5 sm:px-[22px]"
                style={{ background: `color-mix(in srgb, var(--accent) ${shade}%, var(--surface))` }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{u.floor || `Space ${units.indexOf(u) + 1}`}</span>
                  <span className="mt-0.5 block truncate text-xs opacity-75">{unitNote(u)}</span>
                </span>
                <span className="text-2xl font-semibold tracking-[-0.02em] tabular-nums sm:text-[26px]">{nf(u.available_area_m2)}</span>
                <span className="text-sm opacity-75">m²</span>
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-white/15 opacity-80 transition group-hover:opacity-100" aria-label={`Edit ${u.floor || "this space"}`}>
                  <Pencil size={13} aria-hidden="true" />
                </span>
              </Link>
            );
          })}
          {stack.length > 0 && <span className="mt-0.5 h-1 rounded-sm bg-foreground" aria-hidden="true" />}
        </div>
      </section>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        <section aria-labelledby="b-details" className={`${card} px-5 pb-3.5 pt-5 sm:px-7 sm:pt-6`}>
          <h2 id="b-details" className={h2}>
            Other details
          </h2>
          <dl className="mt-3.5 grid grid-cols-2 gap-x-6">
            <Fact label="City">{building.city || null}</Fact>
            <Fact label="Subarea">{building.submarket}</Fact>
            <Fact label="Rentable from">{rentableFrom ? `${nf(rentableFrom)} m²` : null}</Fact>
            <Fact label="Delivery">{deliveries.length ? deliveries.join(", ") : null}</Fact>
            <Fact label="Energy rating">
              {building.energy_label ? (
                <span className="inline-flex items-center gap-2">
                  <EnergyBadge label={building.energy_label} />
                  {building.energy_label}
                </span>
              ) : null}
            </Fact>
            <Fact label="Year of construction">{building.year_built}</Fact>
            <Fact label="Available from">{availability}</Fact>
            <Fact label="Total building area">
              {building.total_building_area_m2 ? `${nf(building.total_building_area_m2)} m²` : null}
            </Fact>
            <Fact label="BREEAM rating">{building.breeam_rating}</Fact>
          </dl>
        </section>

        <div className="flex min-w-0 flex-col gap-5">
          <section aria-labelledby="b-amen" className={`${card} p-5 sm:p-7`}>
            <div className="flex items-baseline gap-2.5">
              <h2 id="b-amen" className={h2}>
                Amenities
              </h2>
              <span className="text-[13px] text-muted">{building.building_amenities.length}</span>
            </div>
            {building.building_amenities.length ? (
              <div className="mt-3.5 flex flex-wrap gap-2">
                {building.building_amenities.map((a) => (
                  <span key={a} className="inline-flex h-[34px] items-center gap-1.5 rounded-full bg-dark pl-3 pr-3.5 text-[13px] font-medium text-white">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3.5 8.5l3 3 6-7" />
                    </svg>
                    {a}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">None added yet.</p>
            )}
            <p className="mt-4 text-[13px] text-muted">
              Shown on the client brochure.{" "}
              <Link href={`/buildings/${building.building_id}/edit`} className="font-medium text-accent hover:underline">
                Edit amenities
              </Link>
            </p>
          </section>

          <section aria-labelledby="b-addons" className={`${card} p-5 sm:p-7`}>
            <h2 id="b-addons" className={h2}>
              Add-ons
            </h2>
            {addons.length > 0 && (
              <div className="mt-3">
                {addons.map((a) => (
                  <div key={a.addon_id} className="flex justify-between gap-3 border-t border-input-bg py-[11px] text-[15px]">
                    <span className="font-medium">{a.name}</span>
                    <span className="tabular-nums">
                      €{nf(a.price)}{" "}
                      <span className="text-xs text-muted">/{a.price_unit.replace(/^EUR\s*\/\s*/i, "").replace(/\s*\/\s*/g, "/")}</span>
                      {a.quantity_available ? <span className="text-xs text-muted"> · {a.quantity_available} available</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3">
              <AddOnForm buildingId={building.building_id} units={units} />
            </div>
          </section>
        </div>
      </div>

      <section aria-labelledby="b-access" className={`${card} mt-5 p-5 sm:p-7`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
          <h2 id="b-access" className={h2}>
            Getting there
          </h2>
          <span className="text-[13px] text-muted">Straight-line distances from the address</span>
        </div>
        <div className="mt-4 grid gap-5 lg:grid-cols-3">
          <div className="relative min-h-[280px] overflow-hidden rounded-2xl bg-input-bg lg:col-span-2 lg:min-h-[340px]">
            {mapQuery ? (
              <iframe
                title="Building location"
                className="absolute inset-0 h-full w-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=15&output=embed`}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">No address yet</div>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <Distance icon={<Car size={20} strokeWidth={1.6} />} label="Highway" note={building.accessibility_note} />
            <Distance icon={<Plane size={20} strokeWidth={1.6} />} label="Airport" note={building.airport_note} />
            <Distance icon={<Train size={20} strokeWidth={1.6} />} label="Public transport" note={building.public_transport_note} />
          </div>
        </div>
      </section>

      <p className="mt-6 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[13px] text-muted">
        {sourceHost ? (
          <span>
            Captured from {sourceHost}
            {building.created_at ? ` on ${longDate(building.created_at)}` : ""}
          </span>
        ) : (
          building.created_at && <span>Added on {longDate(building.created_at)}</span>
        )}
        {building.source_url && (
          <a href={building.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
            Open the listing
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        )}
      </p>
    </div>
  );
}
