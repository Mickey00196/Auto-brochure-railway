import Link from "next/link";
import { serverApi as api } from "@/lib/serverApi";
import { Button, Card } from "@/components/ui";

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default async function HomePage() {
  const [clients, buildings] = await Promise.all([
    api.clients().catch(() => []),
    api.buildings().catch(() => []),
  ]);
  const recentClients = [...clients]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 4);

  return (
    <div>
      {/* Compact mark + one headline — not a huge centered hero. Confidence
          here comes from restraint and whitespace, not size. */}
      <div className="mb-10 flex items-start gap-4">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-dark text-white">
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
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-accent">Office Shortlist</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            A better way to share your buildings.
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Capture buildings, collect them for a client, and send one clean brochure.
          </p>
        </div>
      </div>

      {/* Primary action — the single thing this page wants you to do. */}
      <div className="flex flex-col justify-between gap-5 border-y border-border py-8 sm:flex-row sm:items-center sm:py-9">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-accent">Start here</p>
          <h2 className="mt-1.5 text-lg font-semibold">Add a client</h2>
          <p className="mt-1 text-sm text-muted">Add buildings from your library, then send their brochure.</p>
        </div>
        <Link href="/clients/new" className="shrink-0">
          <Button className="h-11 px-6">+ New client</Button>
        </Link>
      </div>

      {/* Recent clients — real data, most recently updated first. */}
      <section className="mt-10">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Recent clients</h2>
            {clients.length > 0 && (
              <span className="rounded-full bg-border/60 px-2.5 py-1 text-[11px] font-semibold text-muted">
                {clients.length} total
              </span>
            )}
          </div>
          {clients.length > 4 && (
            <Link href="/clients" className="text-xs font-semibold text-accent hover:underline">
              View all →
            </Link>
          )}
        </div>

        {recentClients.length === 0 ? (
          <Card className="mt-5 border-dashed text-center">
            <p className="text-sm font-semibold">No clients yet</p>
            <p className="mt-1 text-xs text-muted">
              Create your first client to start collecting buildings for them.
            </p>
          </Card>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {recentClients.map((c) => (
              <Link key={c.client_id} href={`/clients/${c.client_id}`} className="group">
                <Card className="flex h-full min-h-[136px] flex-col justify-between transition hover:border-accent">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-input-bg text-xs font-bold text-dark">
                        {initials(c.display_name)}
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold group-hover:text-accent">{c.display_name}</h3>
                        <p className="mt-0.5 text-xs text-muted">
                          {c.building_count} {c.building_count === 1 ? "building" : "buildings"}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 text-muted transition group-hover:text-accent" aria-hidden="true">
                      →
                    </span>
                  </div>
                  <p className="mt-5 text-[11px] text-muted">
                    Updated {new Date(c.updated_at).toLocaleDateString()}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Library stats — secondary, quiet strip. */}
      <section className="mt-10 flex flex-col justify-between gap-4 border-t border-border pt-7 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold">
            {buildings.length} building{buildings.length === 1 ? "" : "s"} in your library
          </p>
          <Link href="/buildings" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
            Browse library →
          </Link>
        </div>
        <Link href="/buildings/new">
          <Button variant="ghost" className="h-9">
            + Capture new
          </Button>
        </Link>
      </section>
    </div>
  );
}
