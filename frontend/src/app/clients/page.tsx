import Link from "next/link";
import { serverApi as api } from "@/lib/serverApi";
import { Badge, Button, Card, PageHeader } from "@/components/ui";

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

      <div className="grid gap-6 sm:grid-cols-2">
        {clients.map((c) => (
          <Link key={c.client_id} href={`/clients/${c.client_id}`}>
            <Card className="h-full transition hover:border-accent">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">{c.display_name}</h2>
                  {c.company_name && c.name && <p className="text-sm text-muted">{c.company_name}</p>}
                  {c.industry && <p className="text-sm text-muted">{c.industry}</p>}
                </div>
                <Badge tone={c.building_count > 0 ? "accent" : "default"}>
                  {c.building_count} building{c.building_count === 1 ? "" : "s"}
                </Badge>
              </div>

              {c.contacts.length > 0 && (
                <div className="mt-4 space-y-1 text-sm">
                  {c.contacts.map((contact, i) => (
                    <div key={i}>
                      <span className="font-medium">{contact.name}</span>
                      {contact.role && <span className="text-muted"> — {contact.role}</span>}
                    </div>
                  ))}
                </div>
              )}

              <p className="mt-4 text-xs text-muted">
                Updated {new Date(c.updated_at).toLocaleDateString()}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
