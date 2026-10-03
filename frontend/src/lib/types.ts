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
  public_transport_note: string | null;
  building_amenities: string[];
  description: string | null;
  photos: string[];
  source_url: string | null;
  // NULL = a shared library master. Set = a copy that belongs to one
  // client's folder — a fully independent row, never live-synced to the
  // master. source_building_id is provenance only ("Copied from library
  // on {date}"), never used to keep data in sync.
  client_id: string | null;
  source_building_id: string | null;
  created_at?: string;
  units: Unit[];
}

export interface DuplicateCandidate {
  building_id: string;
  name: string;
  address: string;
  city: string;
  space_count: number;
  is_draft: boolean;
  thumbnail_url: string | null;
  similarity_score: number;
  tier: "exact" | "postcode_house" | "name";
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
  name: string | null;
  company_name: string | null;
  industry: string | null;
  notes: string | null;
  created_by: string | null;
  contacts: { name?: string; role?: string; email?: string }[];
  search_brief: Record<string, unknown> | null;
  display_name: string;
  building_count: number;
  created_at: string;
  updated_at: string;
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
  status: "created" | "error" | "blocked";
  building_id: string | null;
  title: string | null;
  message: string | null;
}

export interface ScrapePreviewResult {
  name: string | null;
  address: string | null;
  city: string | null;
  description: string | null;
  photos: string[];
  energy_label: string | null;
  year_built: number | null;
  building_amenities: string[];
  source_url: string;
}

export interface IngestionRequest {
  city?: string | null;
  property_type?: string;
  min_area_sqm?: number | null;
  max_area_sqm?: number | null;
  sources?: string[] | null;
  max_results?: number;
}

export interface IngestionLogEntry {
  level: string;
  msg: string;
  ts: string;
}

export interface IngestionJob {
  job_id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  params: Record<string, unknown>;
  progress_current: number;
  progress_total: number;
  discovered: number;
  processed: number;
  created: number;
  updated: number;
  unchanged: number;
  duplicates: number;
  failed: number;
  logs: IngestionLogEntry[];
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface SourceHealth {
  source: string;
  display_name: string | null;
  status: "healthy" | "degraded" | "unavailable" | "unknown";
  last_successful_run: string | null;
  last_attempt: string | null;
  last_error: string | null;
  number_of_listings: number;
}
