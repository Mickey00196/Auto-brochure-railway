import { notFound } from "next/navigation";
import { serverApi as api } from "@/lib/serverApi";
import { PageHeader } from "@/components/ui";
import { BuildingForm, type BuildingFormInitial } from "@/components/BuildingForm";

/** The building's own details, opened from Edit on the building page. Its
 * spaces and add-ons are edited from the building page itself. */
export default async function EditBuildingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [building, neighbourhoods] = await Promise.all([
    api.building(id).catch(() => null),
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
    latitude: building.latitude != null ? String(building.latitude) : "",
    longitude: building.longitude != null ? String(building.longitude) : "",
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
        eyebrow={building.client_id ? "Client copy" : "Library"}
        title={`Edit ${building.name}`}
        description={
          building.client_id
            ? "This is a client's own copy. Changes here only affect their folder and live link, never the library."
            : "Correct anything the capture got wrong, then save. Nothing re-scrapes over it."
        }
        backHref={`/buildings/${id}`}
        backLabel={building.name}
      />
      <BuildingForm neighbourhoods={neighbourhoods} initial={initial} buildingId={id} />
    </div>
  );
}
