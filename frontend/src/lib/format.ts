export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return "TBD";
  return `€${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function formatRate(value: number | null | undefined): string {
  if (value === null || value === undefined) return "TBD";
  return `${formatMoney(value)}/m²/yr`;
}

// §24 — TBD renders cleanly as "TBD", never blank, zero, or a crash.
export function formatRent(value: number | null | undefined, priceType: string): string {
  if (priceType === "tbd" || value === null || value === undefined) return "TBD";
  if (priceType === "on_request") return "On request";
  const prefix = priceType === "from" ? "from " : "";
  return `${prefix}${formatRate(value)}`;
}

export function formatArea(value: number): string {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 0 })} m²`;
}

// ── Building-level price summaries (several units → one figure) ──────────

type PricedUnit = {
  pricing_model: string;
  rent_price_type: string;
  rent_eur_per_m2_year: number | null;
  service_charge_eur_per_m2_year: number | null;
  price_per_desk_month_eur: number | null;
};

/** One priced figure, split so a caller can style the unit smaller:
 * { amount: "€395–€410", per: "/m²/yr" }. */
export type PricePart = { amount: string; per: string };

const isNumber = (v: number | null | undefined): v is number => typeof v === "number";
const isDesk = (u: PricedUnit) => u.pricing_model === "per_desk_monthly";

function euroRange(values: number[]): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? formatMoney(min) : `${formatMoney(min)}–${formatMoney(max)}`;
}

/** Rent across all of a building's units. Direct-lease (€/m²/yr) and flex
 * (€/desk/mo) units are summarised separately — never forced onto one scale
 * — and a "from" asking price keeps its qualifier. Returns [] when nothing is
 * priced; callers pick their own fallback ("On request" for a client,
 * "Rent TBD" for a broker). */
export function rentParts(units: PricedUnit[]): PricePart[] {
  const parts: PricePart[] = [];
  const sqm = units.filter(
    (u) =>
      !isDesk(u) && u.rent_price_type !== "tbd" && u.rent_price_type !== "on_request" && isNumber(u.rent_eur_per_m2_year),
  );
  if (sqm.length) {
    const values = sqm.map((u) => u.rent_eur_per_m2_year as number);
    const isFrom = sqm.some((u) => u.rent_price_type === "from");
    parts.push({ amount: isFrom ? `from ${formatMoney(Math.min(...values))}` : euroRange(values), per: "/m²/yr" });
  }
  const desk = units.filter(isDesk).map((u) => u.price_per_desk_month_eur).filter(isNumber);
  if (desk.length) parts.push({ amount: euroRange(desk), per: "/desk/mo" });
  return parts;
}

/** Service charges only exist on direct-lease units — a flex desk price has
 * no separate €/m² service charge to show. */
export function serviceChargeParts(units: PricedUnit[]): PricePart[] {
  const values = units.filter((u) => !isDesk(u)).map((u) => u.service_charge_eur_per_m2_year).filter(isNumber);
  return values.length ? [{ amount: euroRange(values), per: "/m²/yr" }] : [];
}

/** True when every unit is flex — so "no service charge" means "not
 * applicable", not "unknown". */
export function isFlexOnly(units: PricedUnit[]): boolean {
  return units.length > 0 && units.every(isDesk);
}

export function formatPriceParts(parts: PricePart[]): string {
  return parts.map((p) => `${p.amount}${p.per}`).join(" · ");
}

// Units can be priced two ways — per m²/year (direct lease) or per desk/month
// (flex/serviced office, PricingModel.PER_DESK_MONTHLY on the backend).
// Reading rent_eur_per_m2_year for a flex unit would always show "TBD" even
// when it's fully priced in the other model, so callers must branch here
// rather than always calling formatRent.
export function formatUnitHeadlinePrice(unit: {
  pricing_model: string;
  rent_eur_per_m2_year: number | null;
  rent_price_type: string;
  desk_count: number | null;
  price_per_desk_month_eur: number | null;
}): string {
  if (unit.pricing_model === "per_desk_monthly") {
    if (unit.price_per_desk_month_eur === null || unit.desk_count === null) return "TBD";
    return `${formatMoney(unit.price_per_desk_month_eur)}/desk/mo`;
  }
  return formatRent(unit.rent_eur_per_m2_year, unit.rent_price_type);
}
