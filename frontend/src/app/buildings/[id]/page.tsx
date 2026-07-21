import Link from "next/link";
import { notFound } from "next/navigation";
import { serverApi as api } from "@/lib/serverApi";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { AddOnForm } from "@/components/AddOnForm";
import { formatArea, formatUnitHeadlinePrice } from "@/lib/format";

export default async function BuildingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [building, addons] = await Promise.all([
    api.building(id).catch(() => null),
    api.addons({ buildingId: id }).catch(() => []),
  ]);
  if (!building) notFound();

  return (
    <div>
      <PageHeader
        eyebrow={building.source_url ? "Imported from URL" : "Manually entered"}
        title={building.name}
        description={`${building.address}, ${building.city} · ${building.building_type ?? "Office"}${building.energy_label ? ` · Energy label ${building.energy_label}` : ""}`}
        actions={
          <Link href={`/buildings/${id}/units/new`}>
            <Button>+ Add Unit</Button>
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

      <Card className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">Units ({building.units.length})</h2>
        {building.units.length === 0 ? (
          <p className="text-sm text-muted">No units yet — add one to make this building available to a Proposal.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="pb-2 pr-4">Floor</th>
                  <th className="pb-2 pr-4">Area</th>
                  <th className="pb-2 pr-4">Pricing</th>
                  <th className="pb-2 pr-4">Contract Term</th>
                  <th className="pb-2">Delivery</th>
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
                    <td className="py-2 pr-4">{unit.contract_term ?? "TBD"}</td>
                    <td className="py-2 capitalize">{unit.delivery_condition.replaceAll("_", " ")}</td>
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
