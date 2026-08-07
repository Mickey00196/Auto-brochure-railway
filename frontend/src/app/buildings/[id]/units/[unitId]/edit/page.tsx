import { notFound } from "next/navigation";
import { serverApi as api } from "@/lib/serverApi";
import { PageHeader } from "@/components/ui";
import { UnitForm, type UnitFormInitial } from "@/components/UnitForm";

/** Rent, service charges and availability live on the space, not the
 * building — so correcting them needs its own edit screen. */
export default async function EditUnitPage({
  params,
}: {
  params: Promise<{ id: string; unitId: string }>;
}) {
  const { id, unitId } = await params;
  const [building, unit] = await Promise.all([
    api.building(id).catch(() => null),
    api.unit(unitId).catch(() => null),
  ]);
  if (!building || !unit) notFound();

  const initial: UnitFormInitial = {
    floor: unit.floor ?? "",
    availableAreaM2: unit.available_area_m2 ? String(unit.available_area_m2) : "",
    minDivisibleAreaM2: unit.min_divisible_area_m2 ? String(unit.min_divisible_area_m2) : "",
    deliveryCondition: unit.delivery_condition ?? "shell_and_core",
    rentPriceType: unit.rent_price_type ?? "fixed",
    rentEurPerM2Year: unit.rent_eur_per_m2_year ? String(unit.rent_eur_per_m2_year) : "",
    serviceChargePriceType: unit.service_charge_price_type ?? "fixed",
    serviceChargeEurPerM2Year: unit.service_charge_eur_per_m2_year
      ? String(unit.service_charge_eur_per_m2_year)
      : "",
    deskCount: unit.desk_count ? String(unit.desk_count) : "",
    pricePerDeskMonthEur: unit.price_per_desk_month_eur ? String(unit.price_per_desk_month_eur) : "",
    spaceProvider: unit.space_provider ?? "",
    meetingRoomNote: unit.meeting_room_note ?? "",
    parkingRatio: unit.parking_ratio ?? "",
    contractTerm: unit.contract_term ?? "",
    contractTermYears: unit.contract_term_years ? String(unit.contract_term_years) : "",
    availability: unit.availability ?? "",
    unitAmenities: (unit.unit_amenities ?? []).join(", "),
    photos: (unit.photos ?? []).join(", "),
  };

  return (
    <div>
      <PageHeader
        eyebrow={building.address}
        title="Edit space"
        description="Area, rent, service charges and availability — these are the figures that appear in a client PDF."
      />
      <UnitForm
        buildingId={id}
        unitId={unitId}
        initial={initial}
        initialPricingModel={unit.pricing_model === "per_desk_monthly" ? "per_desk_monthly" : "per_sqm_annual"}
      />
    </div>
  );
}
