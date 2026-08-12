import type {
  AddOn,
  Building,
  Client,
  ComparisonRow,
  DashboardData,
  DuplicateCandidate,
  ImportResult,
  IngestionJob,
  IngestionRequest,
  MatchResult,
  Neighbourhood,
  Proposal,
  ProposalWithUnits,
  QAReport,
  ScrapePreviewResult,
  Selection,
  SourceHealth,
  Unit,
} from "./types";

/** One low-level fetch function, two call sites — see api.ts (browser, goes
 * through the same-origin proxy) and serverApi.ts (Server Components, calls
 * the backend directly with the session cookie's token). Both produce this
 * same endpoint shape so every page/component just calls `api.buildings()`
 * etc. without caring which transport is underneath. */
export type DoRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

export function makeApi(request: DoRequest) {
  return {
    dashboard: () => request<DashboardData>("/dashboard"),

    buildings: () => request<Building[]>("/buildings"),
    building: (id: string) => request<Building>(`/buildings/${id}`),
    createBuilding: (payload: Record<string, unknown>) =>
      request<Building>("/buildings", { method: "POST", body: JSON.stringify(payload) }),
    updateBuilding: (id: string, payload: Record<string, unknown>) =>
      request<Building>(`/buildings/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    deleteBuilding: (id: string) => request<void>(`/buildings/${id}`, { method: "DELETE" }),
    checkDuplicateBuilding: (params: {
      address: string;
      city: string;
      postalCode?: string;
      name?: string;
      excludeBuildingId?: string;
    }) => {
      const query = new URLSearchParams({ address: params.address, city: params.city });
      if (params.postalCode) query.set("postal_code", params.postalCode);
      if (params.name) query.set("name", params.name);
      if (params.excludeBuildingId) query.set("exclude_building_id", params.excludeBuildingId);
      return request<DuplicateCandidate[]>(`/buildings/check-duplicate?${query.toString()}`);
    },

    units: (buildingId?: string) =>
      request<Unit[]>(`/units${buildingId ? `?building_id=${buildingId}` : ""}`),
    createUnit: (payload: Record<string, unknown>) =>
      request<Unit>("/units", { method: "POST", body: JSON.stringify(payload) }),
    updateUnit: (id: string, payload: Record<string, unknown>) =>
      request<Unit>(`/units/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    unit: (id: string) => request<Unit>(`/units/${id}`),

    addons: (params: { unitId?: string; buildingId?: string } = {}) => {
      const query = new URLSearchParams();
      if (params.unitId) query.set("unit_id", params.unitId);
      if (params.buildingId) query.set("building_id", params.buildingId);
      const qs = query.toString();
      return request<AddOn[]>(`/addons${qs ? `?${qs}` : ""}`);
    },
    createAddOn: (payload: Record<string, unknown>) =>
      request<AddOn>("/addons", { method: "POST", body: JSON.stringify(payload) }),

    neighbourhoods: () => request<Neighbourhood[]>("/neighbourhoods"),

    selections: () => request<Selection[]>("/selections"),
    selection: (id: string) => request<Selection>(`/selections/${id}`),
    createSelection: (payload: { client_name: string; prepared_by?: string | null; building_ids: string[] }) =>
      request<Selection>("/selections", { method: "POST", body: JSON.stringify(payload) }),
    updateSelection: (
      id: string,
      payload: Partial<{ client_name: string; prepared_by: string | null; building_ids: string[] }>,
    ) => request<Selection>(`/selections/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    deleteSelection: (id: string) => request<void>(`/selections/${id}`, { method: "DELETE" }),

    clients: () => request<Client[]>("/clients"),
    client: (id: string) => request<Client>(`/clients/${id}`),
    createClient: (payload: Partial<Client>) =>
      request<Client>("/clients", { method: "POST", body: JSON.stringify(payload) }),

    proposals: (clientId?: string) =>
      request<Proposal[]>(`/proposals${clientId ? `?client_id=${clientId}` : ""}`),
    proposal: (id: string) => request<ProposalWithUnits>(`/proposals/${id}`),
    createProposal: (payload: { client_id: string; title: string; prepared_by?: string; unit_ids: string[] }) =>
      request<ProposalWithUnits>("/proposals", { method: "POST", body: JSON.stringify(payload) }),
    updateProposal: (
      id: string,
      payload: Partial<{ title: string; prepared_by: string; status: string; notes: string; unit_ids: string[] }>,
    ) => request<ProposalWithUnits>(`/proposals/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    deleteProposal: (id: string) => request<void>(`/proposals/${id}`, { method: "DELETE" }),

    comparison: (proposalId: string) => request<ComparisonRow[]>(`/proposals/${proposalId}/comparison`),
    qa: (proposalId: string, acknowledgedUnitIds: string[] = []) => {
      const params = acknowledgedUnitIds.map((id) => `acknowledged_unit_ids=${id}`).join("&");
      return request<QAReport>(`/proposals/${proposalId}/qa${params ? `?${params}` : ""}`);
    },

    match: (criteria: Record<string, unknown>) =>
      request<MatchResult[]>("/match", { method: "POST", body: JSON.stringify(criteria) }),

    seedDemo: () => request<ProposalWithUnits>("/seed/demo", { method: "POST" }),

    importUrls: (urls: string[]) =>
      request<ImportResult[]>("/imports/urls", { method: "POST", body: JSON.stringify({ urls }) }),
    scrapePreview: (url: string) =>
      request<ScrapePreviewResult>("/imports/preview", { method: "POST", body: JSON.stringify({ url }) }),
    parseText: (content: string) =>
      request<ScrapePreviewResult>("/imports/parse-text", { method: "POST", body: JSON.stringify({ content }) }),

    startIngestion: (payload: IngestionRequest) =>
      request<IngestionJob>("/ingestion/jobs", { method: "POST", body: JSON.stringify(payload) }),
    ingestionJob: (jobId: string) => request<IngestionJob>(`/ingestion/jobs/${jobId}`),
    sourceHealth: () => request<SourceHealth[]>("/ingestion/sources"),

    me: () => request<{ user_id: string; email: string; name: string; role: string }>("/auth/me"),
  };
}
