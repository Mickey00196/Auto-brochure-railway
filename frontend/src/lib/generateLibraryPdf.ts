import { PROXY_BASE_URL } from "@/lib/api";

// Generous, but bounded: a large selection with many photos genuinely can
// take a while to render server-side, and the known Railway connectivity
// issues mean a hang is a real possibility, not just a theoretical one. A
// bound here means a stuck backend costs a clear error, not a "Generating…"
// button that never comes back — the caller still has to refresh before,
// there was no way out at all short of that.
const GENERATE_TIMEOUT_MS = 45_000;

/** Shared by the library page and a client folder — both build the same
 * availability PDF from a client name + an ordered list of building ids,
 * they just source that list differently. */
export async function downloadLibraryPdf({
  clientName,
  buildingIds,
  preparedBy,
}: {
  clientName: string;
  buildingIds: string[];
  preparedBy: string | null;
}): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${PROXY_BASE_URL}/library/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: clientName, building_ids: buildingIds, prepared_by: preparedBy }),
      signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      throw new Error(
        "PDF generation is taking too long and may be stuck — the backend could be temporarily unreachable. Try again in a moment.",
      );
    }
    throw new Error(e instanceof Error ? `Could not reach the server: ${e.message}` : "Could not reach the server.");
  }
  if (res.status === 401) {
    window.location.href = "/login";
    return;
  }
  if (!res.ok) {
    const body = await res.text();
    let detail = body;
    try {
      detail = JSON.parse(body).detail ?? body;
    } catch {
      /* not JSON */
    }
    throw new Error(typeof detail === "string" && detail ? detail : "Could not generate the PDF");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `availability-${clientName.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
