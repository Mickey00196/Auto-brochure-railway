import type { ComparisonRow } from "@/lib/types";
import { Badge, Card } from "@/components/ui";
import { formatArea, formatMoney } from "@/lib/format";

function costCell(row: ComparisonRow): string {
  if (row.is_tbd) return "TBD";
  if (row.pricing_model === "per_desk_monthly") {
    return `${formatMoney(row.price_per_desk_month_eur)}/desk/mo`;
  }
  return row.all_in_rate_eur_per_m2_year !== null ? `${formatMoney(row.all_in_rate_eur_per_m2_year)}/m²/yr` : "TBD";
}

function annualCostCell(row: ComparisonRow): string {
  if (row.is_tbd) return "TBD";
  if (row.pricing_model === "per_desk_monthly") {
    return row.monthly_total_eur !== null ? `${formatMoney(row.monthly_total_eur)}/mo total` : "TBD";
  }
  return formatMoney(row.estimated_annual_cost_eur);
}

export function ComparisonTable({ rows }: { rows: ComparisonRow[] }) {
  return (
    <Card>
      <h2 className="text-lg font-semibold">§16 Comparison</h2>
      <p className="mt-1 text-sm text-muted">
        All-in rate / monthly cost are computed, not hand-typed — direct-lease (€/m²/yr) and flex/per-desk
        (€/desk/mo) units are ranked separately, never mixed onto the same scale, with TBD rows last.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="pb-2 pr-4">Location</th>
              <th className="pb-2 pr-4">Floor</th>
              <th className="pb-2 pr-4">Area</th>
              <th className="pb-2 pr-4">Pricing Model</th>
              <th className="pb-2 pr-4">All-in / Desk Rate</th>
              <th className="pb-2 pr-4">Est. Cost</th>
              <th className="pb-2">Energy</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.unit_id} className="border-b border-border/60 last:border-none">
                <td className="py-2 pr-4">{row.building_name}</td>
                <td className="py-2 pr-4">{row.floor ?? "—"}</td>
                <td className="py-2 pr-4">{formatArea(row.available_area_m2)}</td>
                <td className="py-2 pr-4 text-muted">{row.pricing_model === "per_sqm_annual" ? "Direct lease" : "Flex / per desk"}</td>
                <td className="py-2 pr-4 font-semibold">
                  {row.is_tbd ? <Badge tone="warn">TBD</Badge> : costCell(row)}
                </td>
                <td className="py-2 pr-4">{annualCostCell(row)}</td>
                <td className="py-2">{row.energy_label ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
