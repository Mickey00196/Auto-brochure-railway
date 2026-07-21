import Link from "next/link";
import { serverApi as api } from "@/lib/serverApi";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { formatArea, formatUnitHeadlinePrice } from "@/lib/format";

export default async function BuildingsPage() {
  const buildings = await api.buildings().catch(() => []);

  return (
    <div>
      <PageHeader
        eyebrow="§5.1 / §5.2"
        title="Buildings & Units"
        description="One Building can list several leasable Units — different floors, prices, and delivery conditions — rather than collapsing everything into a single record. Added manually or by pasting a URL, every building lands in this same list."
        actions={
          <Link href="/buildings/new">
            <Button>+ Add Building</Button>
          </Link>
        }
      />

      {buildings.length === 0 && (
        <Card>
          No buildings yet. Load the reference brochure demo data from the{" "}
          <Link href="/" className="text-accent hover:underline">
            dashboard
          </Link>
          , or create one via the API.
        </Card>
      )}

      <div className="space-y-6">
        {buildings.map((building) => (
          <Card key={building.building_id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Link href={`/buildings/${building.building_id}`} className="text-xl font-semibold hover:text-accent hover:underline">
                  {building.name}
                </Link>
                <p className="text-sm text-muted">
                  {building.address}, {building.city} · {building.building_type ?? "Office"}
                  {building.energy_label && ` · Energy label ${building.energy_label}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge>{building.units.length} unit{building.units.length === 1 ? "" : "s"}</Badge>
                <Link href={`/buildings/${building.building_id}`} className="text-xs font-semibold text-accent hover:underline">
                  Manage →
                </Link>
              </div>
            </div>

            {building.building_amenities.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {building.building_amenities.map((amenity) => (
                  <Badge key={amenity} tone="default">
                    {amenity}
                  </Badge>
                ))}
              </div>
            )}

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="pb-2 pr-4">Floor</th>
                    <th className="pb-2 pr-4">Area</th>
                    <th className="pb-2 pr-4">Pricing</th>
                    <th className="pb-2 pr-4">Service Charge</th>
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
                        {unit.min_divisible_area_m2 && (
                          <span className="text-muted"> (from {formatArea(unit.min_divisible_area_m2)})</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {formatUnitHeadlinePrice(unit) === "TBD" ? (
                          <Badge tone="warn">TBD</Badge>
                        ) : (
                          formatUnitHeadlinePrice(unit)
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {unit.pricing_model === "per_desk_monthly" ? (
                          <span className="text-muted">Included</span>
                        ) : unit.service_charge_price_type === "tbd" ? (
                          <Badge tone="warn">TBD</Badge>
                        ) : (
                          `€${unit.service_charge_eur_per_m2_year?.toLocaleString("en-US")}/m²/yr`
                        )}
                      </td>
                      <td className="py-2 pr-4">{unit.contract_term ?? "TBD"}</td>
                      <td className="py-2 capitalize">{unit.delivery_condition.replaceAll("_", " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
