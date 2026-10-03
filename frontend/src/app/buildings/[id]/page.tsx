import Link from "next/link";
import { notFound } from "next/navigation";
import { serverApi as api } from "@/lib/serverApi";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { AddOnForm } from "@/components/AddOnForm";
import { BuildingForm, type BuildingFormInitial } from "@/components/BuildingForm";
import { formatArea, formatUnitHeadlinePrice } from "@/lib/format";

/** Clicking a building in the library lands here, and everything about it is
 * editable on this one page: its details in the form, its available spaces
 * and its add-ons below. (There used to be a separate /edit route — one hop
 * too many for "click a building, change something".) */
export default async function BuildingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [building, addons, neighbourhoods] = await Promise.all([
    api.building(id).catch(() => null),
    api.addons({ buildingId: id }).catch(() => []),
    Promise.race([
      api.neighbourhoods().catch(() => []),
      new Promise<never[]>((resolve) => setTimeout(() => resolve([]), 1500)),
    ]),
  ]);
  if (!building) notFound();

  const initial: BuildingFormInitial = {
    name: building.name ?? "",
    address: building.address ?? "",
    postalCode: building.postal_code ?? "",
    city: building.city ?? "",
    neighbourhoodId: building.neighbourhood_id ?? "",
    submarket: building.submarket ?? "",
    buildingType: building.building_type ?? "",
    yearBuilt: building.year_built ? String(building.year_built) : "",
    energyLabel: building.energy_label ?? "",
    breeamRating: building.breeam_rating ?? "",
    totalBuildingAreaM2: building.total_building_area_m2 ? String(building.total_building_area_m2) : "",
    accessibilityNote: building.accessibility_note ?? "",
    airportNote: building.airport_note ?? "",
    publicTransportNote: building.public_transport_note ?? "",
    buildingAmenities: building.building_amenities ?? [],
    photos: (building.photos ?? []).join(", "),
  };

  return (
    <div>
      <PageHeader
        eyebrow="Building library"
        title={building.name}
        description="Everything here is editable — correct anything the capture got wrong, then save. Your changes stay; nothing re-scrapes over them."
        actions={
          <Link href={`/buildings/${id}/units/new`}>
            <Button>+ Add space</Button>
          </Link>
        }
      />

      {building.building_amenities.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {building.building_amenities.map((a) => (
            <Badge key={a}>{a}</Badge>
          ))}
        </div>
      )}

      <div className="mb-6">
        <BuildingForm neighbourhoods={neighbourhoods} initial={initial} buildingId={id} />
      </div>

      <Card className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">
          Available spaces ({building.units.length})
        </h2>
        {building.units.length === 0 ? (
          <p className="text-sm text-muted">
            No spaces yet — add one so this building can appear with an area and rent in a client PDF.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="pb-2 pr-4">Floor</th>
                  <th className="pb-2 pr-4">Area</th>
                  <th className="pb-2 pr-4">Pricing</th>
                  <th className="pb-2 pr-4">Available</th>
                  <th className="pb-2 pr-4">Contract term</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {building.units.map((unit) => (
                  <tr key={unit.unit_id} className="border-b border-border/60 last:border-none">
                    <td className="py-2 pr-4">{unit.floor ?? "—"}</td>
                    <td className="py-2 pr-4">
                      {formatArea(unit.available_area_m2)}
                      {unit.min_divisible_area_m2 && <span className="text-muted"> (from {formatArea(unit.min_divisible_area_m2)})</span>}
                    </td>
                    <td className="py-2 pr-4">{formatUnitHeadlinePrice(unit)}</td>
                    <td className="py-2 pr-4">{unit.availability ?? "TBD"}</td>
                    <td className="py-2 pr-4">{unit.contract_term ?? "TBD"}</td>
                    <td className="py-2 text-right">
                      <Link
                        href={`/buildings/${id}/units/${unit.unit_id}/edit`}
                        className="text-xs font-semibold text-accent hover:underline"
                      >
                        Edit →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Add-ons ({addons.length})</h2>
        {addons.length > 0 && (
          <ul className="mb-4 space-y-1 text-sm">
            {addons.map((a) => (
              <li key={a.addon_id} className="flex justify-between border-b border-border/60 py-1.5 last:border-none">
                <span>{a.name}</span>
                <span className="text-muted">
                  €{a.price.toLocaleString("en-US")} / {a.price_unit.replace(/^EUR\s*\/\s*/i, "")}
                  {a.quantity_available ? ` · ${a.quantity_available} available` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <AddOnForm buildingId={id} units={building.units} />
      </Card>
    </div>
  );
}
