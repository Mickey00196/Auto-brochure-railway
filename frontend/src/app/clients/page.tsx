import Link from "next/link";
import { serverApi as api } from "@/lib/serverApi";
import { Button, Card, PageHeader } from "@/components/ui";
import { ClientLiveStatusRow } from "@/components/ClientLiveStatusRow";

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Every client's folder: their own copy of whichever buildings a broker has
 * added from the shared library — never the library itself. See
 * services/building_copy.py on the backend for why each folder holds
 * independent rows instead of a live view onto the library. */
export default async function ClientsPage() {
  const clients = await api.clients().catch(() => []);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          eyebrow="Client folders"
          title="Clients"
          description="Each client has their own folder of buildings copied in from the library — edit or send those without touching the shared library."
        />
        <Link href="/clients/new">
          <Button>+ New client</Button>
        </Link>
      </div>

      {clients.length === 0 && (
        <Card>
          No clients yet.{" "}
          <Link href="/clients/new" className="text-accent hover:underline">
            Add your first client
          </Link>{" "}
          to start a folder for them.
        </Card>
      )}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {clients.map((c) => (
          <Link key={c.client_id} href={`/clients/${c.client_id}`} className="group">
            <Card className="flex h-full min-h-[200px] flex-col transition hover:border-accent hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-input-bg text-xs font-bold text-dark">
                  {initials(c.display_name)}
                </span>
                <span className="rounded-full bg-input-bg px-2.5 py-1 text-[11px] font-medium text-muted">
                  {c.building_count} building{c.building_count === 1 ? "" : "s"}
                </span>
              </div>

              <h2 className="mt-4 text-base font-semibold group-hover:text-accent">{c.display_name}</h2>
              {c.company_name && c.name && <p className="mt-0.5 text-xs text-muted">{c.company_name}</p>}
              {c.industry && <p className="text-xs text-muted">{c.industry}</p>}

              {c.contacts.length > 0 ? (
                <p className="mt-2 text-xs text-muted">
                  Contact · {c.contacts[0]!.name}
                  {c.contacts[0]!.role && ` — ${c.contacts[0]!.role}`}
                </p>
              ) : (
                <p className="mt-2 text-xs text-muted">No contact set</p>
              )}

              <div className="mt-auto border-t border-border pt-3.5">
                <ClientLiveStatusRow name={c.display_name} isLive={c.is_live} slug={c.public_slug} />
                <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted">Updated {new Date(c.updated_at).toLocaleDateString()}</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-accent">Open client →</span>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
