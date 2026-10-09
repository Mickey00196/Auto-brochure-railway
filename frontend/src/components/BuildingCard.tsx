import type { ReactNode } from "react";
import Link from "next/link";
import type { Building } from "@/lib/types";
import { PhotoPlaceholder } from "@/components/ui";
import { formatArea, formatPriceParts, rentParts } from "@/lib/format";
import { buildingArea, rentValue } from "@/components/LibraryCard";
import { shortDate } from "@/components/ClientCard";

/** The broker-facing one-liner: "€395–€410/m²/yr", "€525/desk/mo", or a
 * plain status when nothing is priced yet. */
export function buildingRentLabel(units: Building["units"]): string {
  const parts = rentParts(units);
  if (parts.length) return formatPriceParts(parts);
  return units.some((u) => u.rent_price_type === "on_request") ? "Rent on request" : "Rent TBD";
}

/** A building as a compact row — the library's list view and the "Add from
 * library" picker. Like LibraryCard, the row is one overlay link so the
 * leading control, the corner action and the "original" link can sit above
 * it without nesting <a> inside <a>. */
export function BuildingCard({
  building,
  selected = false,
  highlighted = false,
  locked = false,
  provenanceDate = null,
  leading,
  cornerAction,
  linkable = true,
}: {
  building: Building;
  selected?: boolean;
  highlighted?: boolean;
  /** Already-added-to-this-folder: dimmed, not clickable to select. */
  locked?: boolean;
  /** "Copied from library on {date}" provenance line for a client's copy. */
  provenanceDate?: string | null;
  /** Checkbox, lock icon, or nothing — rendered in the left hit-area. */
  leading?: ReactNode;
  /** Delete / remove-from-folder button, top-right. */
  cornerAction?: ReactNode;
  /** false inside a picker, where clicking the row selects it instead. */
  linkable?: boolean;
}) {
  const photo = building.photos[0];
  const area = buildingArea(building);
  const where = [building.submarket, building.city].filter(Boolean).join(", ");
  const ring = selected ? "outline-2 outline-accent" : highlighted ? "outline-2 outline-accent/50" : "";

  return (
    <div
      className={`group relative flex items-center gap-4 rounded-[18px] bg-surface p-3 pr-14 shadow-card transition ${ring} ${
        locked ? "opacity-60" : ""
      }`}
    >
      {linkable && (
        <Link
          href={`/buildings/${building.building_id}`}
          aria-label={`Open ${building.address || building.name}`}
          className="absolute inset-0 z-0 rounded-[18px]"
        />
      )}
      {leading && <div className="relative z-10 shrink-0 pl-1">{leading}</div>}
      <div className="pointer-events-none h-20 w-28 shrink-0 overflow-hidden rounded-xl">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary captured URLs, no fixed domain to allowlist
          <img src={photo} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <PhotoPlaceholder className="h-full w-full" />
        )}
      </div>
      <div className="pointer-events-none min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold tracking-[-0.01em] group-hover:text-accent">
          {building.address || building.name}
        </p>
        {where && <p className="mt-0.5 truncate text-sm text-muted">{where}</p>}
        <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
          <span>{area > 0 ? formatArea(area) : "Area TBD"}</span>
          <span className="text-muted">{rentValue(building)}</span>
          {building.energy_label && <span className="text-muted">Energy {building.energy_label}</span>}
          <span className="text-muted">
            {building.units.length} space{building.units.length === 1 ? "" : "s"}
          </span>
        </p>
        {provenanceDate && (
          <p className="mt-1.5 text-xs text-muted">
            Copied from the library on {shortDate(provenanceDate)}
            {building.source_building_id && (
              <>
                {", "}
                <Link
                  href={`/buildings/${building.source_building_id}`}
                  className="pointer-events-auto relative z-10 font-medium text-accent hover:underline"
                >
                  open the original
                </Link>
              </>
            )}
          </p>
        )}
      </div>
      {locked && <span className="pointer-events-none shrink-0 text-xs font-medium text-muted">Already added</span>}
      {cornerAction && (
        <div className="absolute right-3 top-3 z-10 transition-opacity focus-within:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">
          {cornerAction}
        </div>
      )}
    </div>
  );
}
