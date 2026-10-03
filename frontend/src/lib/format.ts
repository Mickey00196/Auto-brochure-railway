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
