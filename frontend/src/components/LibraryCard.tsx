import type { ReactNode } from "react";
import Link from "next/link";
import type { Building } from "@/lib/types";
import { formatArea, formatPriceParts, rentParts } from "@/lib/format";
import { PhotoPlaceholder } from "@/components/ui";

const isFloorplan = (url: string) => /plattegrond|floorplan/i.test(url);

export function buildingArea(building: Building): number {
  return building.units.reduce((sum, u) => sum + (u.available_area_m2 ?? 0), 0);
}

/** The value for a "Rent" label: "€395–€410/m²/yr", "€980/desk/mo", or a
 * plain status when nothing's priced. */
export function rentValue(building: Building): string {
  const parts = rentParts(building.units);
  if (parts.length) return formatPriceParts(parts);
  return building.units.some((u) => u.rent_price_type === "on_request") ? "On request" : "TBD";
}

/** A building as a photo card — the library grid and a client folder's
 * buildings. The card is one link (an overlay, so the select control and the
 * corner action can sit above it without nesting interactive elements). */
export function LibraryCard({
  building,
  selected = false,
  onToggle,
  highlighted = false,
  cornerAction,
  note,
}: {
  building: Building;
  selected?: boolean;
  /** Present → a "Select" control on the photo. */
  onToggle?: () => void;
  /** Just captured — ringed until the next visit. */
  highlighted?: boolean;
  /** Delete / remove-from-folder, top-right on the photo. */
  cornerAction?: ReactNode;
  /** Extra line under the figures (e.g. "Copied from the library on…"). */
  note?: ReactNode;
}) {
  const photo = building.photos.find((p) => !isFloorplan(p)) ?? building.photos[0];
  const area = buildingArea(building);
  const where = [building.submarket, building.city].filter(Boolean).join(", ");
  // outline, not ring: ring is a box-shadow and would be replaced by the card's own shadow.
  const ring = selected ? "outline-2 outline-accent" : highlighted ? "outline-2 outline-accent/50" : "";

  return (
    <article
      className={`group relative flex min-w-0 flex-col rounded-[20px] bg-surface p-2.5 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-float ${ring}`}
    >
      <Link
        href={`/buildings/${building.building_id}`}
        aria-label={`Open ${building.address || building.name}`}
        className="absolute inset-0 z-0 rounded-[20px]"
      />
      <div className="pointer-events-none relative aspect-[4/3] overflow-hidden rounded-[14px]">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary captured URLs, no fixed domain to allowlist
          <img
            src={photo}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <PhotoPlaceholder className="h-full w-full" />
        )}
      </div>

      {onToggle && (
        <label
          className={`absolute left-5 top-5 z-10 inline-flex h-8 cursor-pointer items-center gap-2 rounded-full pl-2.5 pr-3 text-xs font-medium shadow-card backdrop-blur transition-colors ${
            selected ? "bg-accent text-white" : "bg-surface/95 text-foreground hover:bg-surface"
          }`}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="h-4 w-4 cursor-pointer accent-white"
            aria-label={`Select ${building.address || building.name}`}
          />
          {selected ? "Selected" : "Select"}
        </label>
      )}
      {/* Destructive, so it stays out of the way until the card is hovered or
          focused — always visible on touch screens, which have no hover. */}
      {cornerAction && (
        <div className="absolute right-5 top-5 z-10 transition-opacity focus-within:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">
          {cornerAction}
        </div>
      )}

      <div className="pointer-events-none flex flex-1 flex-col px-2.5 pb-2 pt-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 text-[17px] font-semibold leading-snug tracking-[-0.01em] group-hover:text-accent">
            {building.address || building.name}
          </h3>
          {building.energy_label && (
            <span
              title="Energy label"
              className="mt-0.5 inline-flex h-6 min-w-7 shrink-0 items-center justify-center rounded-md bg-success-bg px-1.5 text-xs font-semibold text-success-foreground"
            >
              {building.energy_label}
            </span>
          )}
        </div>
        {where && <p className="mt-0.5 truncate text-sm text-muted">{where}</p>}
        {/* Pushes the figures to the card's bottom, so rows line up across
            cards whose addresses wrap differently. */}
        <div className="min-h-4 flex-1" aria-hidden="true" />
        <dl className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border/70 pt-3">
          <div>
            <dt className="text-xs text-muted">Available</dt>
            <dd className="mt-0.5 text-sm font-medium tabular-nums">{area > 0 ? formatArea(area) : "TBD"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Rent</dt>
            <dd className="mt-0.5 text-sm font-medium tabular-nums">{rentValue(building)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Spaces</dt>
            <dd className="mt-0.5 text-sm font-medium tabular-nums">{building.units.length}</dd>
          </div>
        </dl>
        {note && <div className="pointer-events-auto relative z-10 mt-3 text-xs text-muted">{note}</div>}
      </div>
    </article>
  );
}
