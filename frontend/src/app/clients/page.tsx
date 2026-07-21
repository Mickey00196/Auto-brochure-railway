import Link from "next/link";
import { serverApi as api } from "@/lib/serverApi";
import { Card, PageHeader } from "@/components/ui";

export default async function ClientsPage() {
  const clients = await api.clients().catch(() => []);

  return (
    <div>
      <PageHeader
        eyebrow="§5.5 Client"
        title="Clients"
        description="Each Proposal is a dated selection of units sent to one named client — the search brief here feeds Property Matching (§12)."
      />

      {clients.length === 0 && (
        <Card>
          No clients yet. Load the reference brochure demo data from the{" "}
          <Link href="/" className="text-accent hover:underline">
            dashboard
          </Link>
          .
        </Card>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {clients.map((c) => (
          <Card key={c.client_id}>
            <h2 className="text-lg font-semibold">{c.company_name}</h2>
            {c.industry && <p className="text-sm text-muted">{c.industry}</p>}

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

            {c.search_brief && (
              <div className="mt-4 rounded-xl bg-background/60 p-3 text-xs text-muted">
                <pre className="whitespace-pre-wrap">{JSON.stringify(c.search_brief, null, 2)}</pre>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
