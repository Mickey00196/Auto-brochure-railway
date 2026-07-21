"""Pydantic I/O schemas mirroring the models in app/models — see spec §5."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import (
    DeliveryCondition,
    PricingModel,
    ProposalStatus,
    RentPriceType,
    ServiceChargePriceType,
    UserRole,
)

# ─────────────────────────────────────────── Neighbourhood ───────────────────────────────────────────


class NeighbourhoodBase(BaseModel):
    name: str
    city: str
    description: str | None = None
    public_transport: list[dict[str, Any]] = Field(default_factory=list)
    nearby_amenities: list[dict[str, Any]] = Field(default_factory=list)


class NeighbourhoodCreate(NeighbourhoodBase):
    pass


class NeighbourhoodOut(NeighbourhoodBase):
    model_config = ConfigDict(from_attributes=True)
    neighbourhood_id: str
    created_at: datetime
    updated_at: datetime


# ─────────────────────────────────────────── AddOn ───────────────────────────────────────────


class AddOnBase(BaseModel):
    name: str
    price: float
    price_unit: str
    quantity_available: int | None = None
    unit_id: str | None = None
    building_id: str | None = None


class AddOnCreate(AddOnBase):
    pass


class AddOnOut(AddOnBase):
    model_config = ConfigDict(from_attributes=True)
    addon_id: str
    created_at: datetime


# ─────────────────────────────────────────── Building ───────────────────────────────────────────


class BuildingBase(BaseModel):
    name: str
    address: str
    postal_code: str | None = None
    city: str
    country: str = "Netherlands"
    latitude: float | None = None
    longitude: float | None = None
    neighbourhood_id: str | None = None
    submarket: str | None = None
    building_type: str | None = None
    year_built: int | None = None
    renovation_year: int | None = None
    energy_label: str | None = None
    breeam_rating: str | None = None
    total_building_area_m2: float | None = None
    accessibility_note: str | None = None
    airport_note: str | None = None
    building_amenities: list[str] = Field(default_factory=list)
    description: str | None = None
    photos: list[str] = Field(default_factory=list)
    source_url: str | None = None


class BuildingCreate(BuildingBase):
    pass


class BuildingOut(BuildingBase):
    model_config = ConfigDict(from_attributes=True)
    building_id: str
    created_at: datetime
    updated_at: datetime


class BuildingWithUnits(BuildingOut):
    units: list["UnitOut"] = Field(default_factory=list)


# ─────────────────────────────────────────── Unit ───────────────────────────────────────────


class UnitBase(BaseModel):
    building_id: str
    floor: str | None = None
    available_area_m2: float
    min_divisible_area_m2: float | None = None
    delivery_condition: DeliveryCondition = DeliveryCondition.SHELL_AND_CORE
    rent_price_type: RentPriceType = RentPriceType.TBD
    rent_eur_per_m2_year: float | None = None
    service_charge_price_type: ServiceChargePriceType = ServiceChargePriceType.TBD
    service_charge_eur_per_m2_year: float | None = None
    pricing_model: PricingModel = PricingModel.PER_SQM_ANNUAL
    desk_count: int | None = None
    price_per_desk_month_eur: float | None = None
    space_provider: str | None = None
    meeting_room_note: str | None = None
    parking_ratio: str | None = None
    contract_term: str | None = None
    contract_term_years: int | None = None
    availability: str | None = None
    unit_amenities: list[str] = Field(default_factory=list)
    photos: list[str] = Field(default_factory=list)
    floorplan_url: str | None = None


class UnitCreate(UnitBase):
    pass


class UnitOut(UnitBase):
    model_config = ConfigDict(from_attributes=True)
    unit_id: str
    created_at: datetime
    updated_at: datetime


class UnitWithBuilding(UnitOut):
    building: BuildingOut


# ─────────────────────────────────────────── Client ───────────────────────────────────────────


class ClientBase(BaseModel):
    company_name: str
    industry: str | None = None
    contacts: list[dict[str, Any]] = Field(default_factory=list)
    search_brief: dict[str, Any] | None = None


class ClientCreate(ClientBase):
    pass


class ClientOut(ClientBase):
    model_config = ConfigDict(from_attributes=True)
    client_id: str
    created_at: datetime
    updated_at: datetime


# ─────────────────────────────────────────── Proposal ───────────────────────────────────────────


class ProposalBase(BaseModel):
    client_id: str
    title: str
    prepared_by: str | None = None
    status: ProposalStatus = ProposalStatus.DRAFT
    notes: str | None = None
    document_type: str = "Market Inventory"
    search_area_label: str | None = None
    project_team: list[dict[str, Any]] = Field(default_factory=list)


class ProposalCreate(ProposalBase):
    unit_ids: list[str] = Field(default_factory=list, description="Ordered list — display rank follows order")


class ProposalUpdate(BaseModel):
    title: str | None = None
    prepared_by: str | None = None
    status: ProposalStatus | None = None
    notes: str | None = None
    document_type: str | None = None
    search_area_label: str | None = None
    project_team: list[dict[str, Any]] | None = None
    unit_ids: list[str] | None = None


class ProposalOut(ProposalBase):
    model_config = ConfigDict(from_attributes=True)
    proposal_id: str
    prepared_at: datetime
    generated_outputs: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    selected_unit_ids: list[str] = Field(default_factory=list)


class ProposalWithUnits(ProposalOut):
    selected_units: list[UnitWithBuilding] = Field(default_factory=list)
    client: ClientOut


BuildingWithUnits.model_rebuild()
UnitWithBuilding.model_rebuild()
ProposalWithUnits.model_rebuild()


class LoginRequest(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: str
    email: str
    name: str
    role: UserRole


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
