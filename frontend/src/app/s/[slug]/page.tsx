import { notFound } from "next/navigation";
import type { PublicClient } from "@/lib/types";
import { INTERNAL_API_BASE_URL } from "@/lib/serverApi";
import { formatArea } from "@/lib/format";

/** A client's shareable live link — the one page in this app a visitor with
 * no account can open (see proxy.ts and NavBar.tsx). Fetched straight from
 * the backend's unauthenticated /public/clients/{slug}, never through
 * serverApi (every other call there assumes a logged-in broker). */
async function getPublicClient(slug: string): Promise<PublicClient | null> {
  try {
    const res = await fetch(`${INTERNAL_API_BASE_URL}/public/clients/${slug}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as PublicClient;
  } catch {
    return null;
  }
}

export default async function PublicClientPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const client = await getPublicClient(slug);
  if (!client) notFound();

  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-dark text-white">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M2 13.5V5l5-3 5 3v8.5M4.5 13.5v-4h2.5v4M9 13.5v-4h2.5v4M2 13.5h10.5"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="text-sm font-bold tracking-wide text-accent">OFFICE SHORTLIST</span>
      </div>

      <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">{client.display_name}</h1>
      <p className="mt-2 text-muted">
        {client.buildings.length} building{client.buildings.length === 1 ? "" : "s"} selected for you.
      </p>

      {client.buildings.length === 0 ? (
        <p className="mt-10 text-sm text-muted">No buildings have been added to this shortlist yet.</p>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {client.buildings.map((b) => {
            const totalAvailable = b.units.reduce((sum, u) => sum + (u.available_area_m2 ?? 0), 0);
            const rents = b.units.map((u) => u.rent_eur_per_m2_year).filter((r): r is number => typeof r === "number");
            const rentLabel = rents.length
              ? rents.length === 1 || Math.min(...rents) === Math.max(...rents)
                ? `€${Math.min(...rents).toLocaleString("en-US")}/m²/yr`
                : `€${Math.min(...rents).toLocaleString("en-US")}–€${Math.max(...rents).toLocaleString("en-US")}/m²/yr`
              : "Rent TBD";
            return (
              <article key={b.building_id} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
                {b.photos[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- arbitrary captured URLs, no fixed domain to allowlist
                  <img src={b.photos[0]} alt="" className="h-44 w-full object-cover" />
                ) : (
                  <div className="flex h-44 items-center justify-center bg-input-bg text-xs text-muted">No photo</div>
                )}
                <div className="p-5">
                  <h2 className="text-base font-semibold">{b.address}</h2>
                  <p className="mt-0.5 text-sm text-muted">{[b.submarket, b.city].filter(Boolean).join(" · ")}</p>
                  <p className="mt-3 text-sm font-medium">
                    {totalAvailable > 0 ? formatArea(totalAvailable) : "Area TBD"}
                    <span className="mx-1.5 font-normal text-border">|</span>
                    <span className="font-normal text-muted">{rentLabel}</span>
                  </p>
                  {b.building_amenities.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {b.building_amenities.slice(0, 6).map((a) => (
                        <span key={a} className="rounded-md bg-input-bg px-2 py-1 text-[11px] font-medium">
                          {a}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
