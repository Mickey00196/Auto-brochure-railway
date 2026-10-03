import type { ReactNode } from "react";
import Link from "next/link";
import type { Building } from "@/lib/types";
import { Badge, Card } from "@/components/ui";
import { formatArea } from "@/lib/format";

/** The building row shared by the Building Library, the client folder page,
 * and the "Add from library" picker inside it — one card, three contexts.
 * Each caller supplies its own selection control (checkbox / none) and
 * corner action (delete / remove-from-folder / lock icon) rather than the
 * card owning that logic, since what "selecting" or "acting on" a building
 * means differs per screen. */
export function BuildingCard({
  building,
  selected = false,
  highlighted = false,
  locked = false,
  provenanceDate = null,
  leading,
  cornerAction,
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
  /** Delete / remove-from-folder button, absolutely positioned top-right. */
  cornerAction?: ReactNode;
}) {
  const totalAvailable = building.units.reduce((sum, u) => sum + (u.available_area_m2 ?? 0), 0);
  const rents = building.units
    .map((u) => u.rent_eur_per_m2_year)
    .filter((r): r is number => typeof r === "number");
  const rentLabel = rents.length
    ? rents.length === 1 || Math.min(...rents) === Math.max(...rents)
      ? `€${Math.min(...rents).toLocaleString("en-US")}/m²/yr`
      : `€${Math.min(...rents).toLocaleString("en-US")}–€${Math.max(...rents).toLocaleString("en-US")}/m²/yr`
    : "Rent TBD";

  return (
    <Card
      className={`relative transition ${selected ? "border-accent ring-1 ring-accent" : ""} ${
        highlighted ? "ring-2 ring-accent" : ""
      } ${locked ? "opacity-60" : ""}`}
    >
      {cornerAction}
      <div className="flex items-start gap-5">
        {leading}
        <Link href={`/buildings/${building.building_id}`} className="shrink-0">
          {building.photos.length > 0 ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary captured URLs, no fixed domain to allowlist
            <img
              src={building.photos[0]}
              alt=""
              className="h-20 w-20 rounded-xl border border-border object-cover sm:h-24 sm:w-24"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-dashed border-border text-[10px] text-muted sm:h-24 sm:w-24">
              No photo
            </div>
          )}
        </Link>

        <Link href={`/buildings/${building.building_id}`} className="group min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-accent group-hover:underline">{building.address}</p>
          <p className="mt-0.5 text-sm text-muted">{[building.submarket, building.city].filter(Boolean).join(" · ")}</p>
          <p className="mt-2 text-sm font-medium">
            {totalAvailable > 0 ? formatArea(totalAvailable) : "Area TBD"}
            <span className="mx-1.5 font-normal text-border">|</span>
            <span className="font-normal text-muted">{rentLabel}</span>
            {building.energy_label && <span className="font-normal text-muted"> · Energy {building.energy_label}</span>}
          </p>
          {(building.public_transport_note || building.accessibility_note || building.airport_note) && (
            <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
              {building.public_transport_note && <span>🚉 {building.public_transport_note}</span>}
              {building.accessibility_note && <span>🛣️ {building.accessibility_note}</span>}
              {building.airport_note && <span>✈️ {building.airport_note}</span>}
            </p>
          )}
          {building.building_amenities.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {building.building_amenities.slice(0, 6).map((a) => (
                <span key={a} className="rounded-md bg-input-bg px-2 py-1 text-[11px] font-medium text-foreground">
                  {a}
                </span>
              ))}
              {building.building_amenities.length > 6 && (
                <span className="px-1 py-1 text-[11px] text-muted">
                  +{building.building_amenities.length - 6} more
                </span>
              )}
            </div>
          )}
          {provenanceDate && (
            <p className="mt-2 text-xs text-muted">
              Copied from library on {new Date(provenanceDate).toLocaleDateString()}
              {building.source_building_id && (
                <>
                  {" · "}
                  <Link
                    href={`/buildings/${building.source_building_id}`}
                    className="text-accent hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    view master
                  </Link>
                </>
              )}
            </p>
          )}
        </Link>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <Badge>
            {building.units.length} space{building.units.length === 1 ? "" : "s"}
          </Badge>
          {locked ? (
            <span className="text-xs font-semibold text-muted">Already added</span>
          ) : (
            <Link href={`/buildings/${building.building_id}`} className="text-xs font-semibold text-accent hover:underline">
              Edit →
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}
