// Some PaaS blueprints (Render's fromService/hostport, for one) only hand
// back a bare "host:port" for internal service-to-service URLs, no scheme —
// tolerate that instead of requiring every deploy config to know to prepend
// it. Used by every place that calls the FastAPI backend server-to-server:
// serverApi.ts, api/login/route.ts, api/proxy/[...path]/route.ts.
export function internalApiBaseUrl(): string {
  const raw = process.env.INTERNAL_API_BASE_URL ?? "http://localhost:8000";
  return /^https?:\/\//.test(raw) ? raw : `http://${raw}`;
}
