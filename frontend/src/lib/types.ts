// Mirrors backend/app/schemas.py — see spec §5.

export type DeliveryCondition = "turn_key" | "shell_and_core" | "shell_and_core_plus" | "mixed";
export type RentPriceType = "fixed" | "from" | "on_request" | "tbd";
export type ServiceChargePriceType = "fixed" | "tbd";
export type ProposalStatus = "draft" | "sent" | "under_review" | "closed";
export type PricingModel = "per_sqm_annual" | "per_desk_monthly";

export interface Neighbourhood {
  neighbourhood_id: string;
  name: string;
  city: string;
  description: string | null;
  public_transport: { line?: string; station?: string; walking_time_min?: number }[];
  nearby_amenities: { category?: string; name?: string; walking_time_min?: number }[];
}

export interface Building {
  building_id: string;
  name: string;
  address: string;
  postal_code: string | null;
  city: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  neighbourhood_id: string | null;
  submarket: string | null;
  building_type: string | null;
  year_built: number | null;
  renovation_year: number | null;
  energy_label: string | null;
  breeam_rating: string | null;
  total_building_area_m2: number | null;
  accessibility_note: string | null;
  airport_note: string | null;
  building_amenities: string[];
  description: string | null;
  photos: string[];
  source_url: string | null;
  units: Unit[];
}

export interface Unit {
  unit_id: string;
  building_id: string;
  floor: string | null;
  available_area_m2: number;
  min_divisible_area_m2: number | null;
  delivery_condition: DeliveryCondition;
  rent_price_type: RentPriceType;
  rent_eur_per_m2_year: number | null;
  service_charge_price_type: ServiceChargePriceType;
  service_charge_eur_per_m2_year: number | null;
  pricing_model: PricingModel;
  desk_count: number | null;
  price_per_desk_month_eur: number | null;
  space_provider: string | null;
  meeting_room_note: string | null;
  parking_ratio: string | null;
  contract_term: string | null;
  contract_term_years: number | null;
  availability: string | null;
  unit_amenities: string[];
  photos: string[];
  building?: Building;
}

export interface AddOn {
  addon_id: string;
  unit_id: string | null;
  building_id: string | null;
  name: string;
  price: number;
  price_unit: string;
  quantity_available: number | null;
}

export interface Client {
  client_id: string;
  company_name: string;
  industry: string | null;
  contacts: { name?: string; role?: string; email?: string }[];
  search_brief: Record<string, unknown> | null;
}

export interface Proposal {
  proposal_id: string;
  client_id: string;
  title: string;
  prepared_by: string | null;
  prepared_at: string;
  status: ProposalStatus;
  notes: string | null;
  document_type: string;
  search_area_label: string | null;
  project_team: { name?: string; role?: string; email?: string; phone?: string }[];
  generated_outputs: { format: string; path: string; generated_at: string }[];
  selected_unit_ids: string[];
}

export interface ProposalWithUnits extends Proposal {
  selected_units: Unit[];
  client: Client;
}

export interface ComparisonRow {
  unit_id: string;
  building_name: string;
  address: string;
  floor: string | null;
  available_area_m2: number;
  pricing_model: PricingModel;
  rent_eur_per_m2_year: number | null;
  rent_price_type: RentPriceType;
  service_charge_eur_per_m2_year: number | null;
  service_charge_price_type: ServiceChargePriceType;
  all_in_rate_eur_per_m2_year: number | null;
  estimated_annual_cost_eur: number | null;
  desk_count: number | null;
  price_per_desk_month_eur: number | null;
  monthly_total_eur: number | null;
  is_tbd: boolean;
  energy_label: string | null;
  contract_term: string | null;
  availability: string | null;
  parking_price_range: string | null;
}

export interface QAIssue {
  severity: "blocking" | "warning" | "info";
  code: string;
  message: string;
  unit_id: string | null;
  field: string | null;
}

export interface QAReport {
  is_export_ready: boolean;
  issue_count: number;
  blocking_count: number;
  warning_count: number;
  issues: QAIssue[];
}

export interface DashboardData {
  imported_properties: { buildings: number; units: number };
  proposals_by_status: Record<ProposalStatus, number>;
  generated_brochures: { total: number; by_format: Record<string, number> };
  data_completeness: {
    active_proposals_checked: number;
    tbd_field_count: number;
    blocking_qa_issue_count: number;
  };
}

export interface MatchResult {
  unit_id: string;
  building_name: string;
  floor: string | null;
  available_area_m2: number;
  score: number;
  reasons: string[];
}

export interface ImportResult {
  url: string;
  status: "created" | "error";
  building_id: string | null;
  title: string | null;
  message: string | null;
}
