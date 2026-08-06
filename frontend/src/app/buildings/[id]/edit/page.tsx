import { notFound } from "next/navigation";
import { serverApi as api } from "@/lib/serverApi";
import { PageHeader } from "@/components/ui";
import { BuildingForm, type BuildingFormInitial } from "@/components/BuildingForm";

export default async function EditBuildingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [building, neighbourhoods] = await Promise.all([
    api.building(id).catch(() => null),
    api.neighbourhoods().catch(() => []),
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
    buildingAmenities: (building.building_amenities ?? []).join(", "),
    description: building.description ?? "",
    photos: (building.photos ?? []).join(", "),
  };

  return (
    <div>
      <PageHeader
        eyebrow="Building library"
        title={`Edit ${building.name}`}
        description="Correct or complete anything that was captured. Your changes stay — nothing re-scrapes over them."
      />
      <BuildingForm neighbourhoods={neighbourhoods} initial={initial} buildingId={id} />
    </div>
  );
}
