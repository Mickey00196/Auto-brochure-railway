import { Plus } from "lucide-react";
import { serverApi as api } from "@/lib/serverApi";
import { ButtonLink, PageHeader } from "@/components/ui";
import { ClientCard, NewClientCard } from "@/components/ClientCard";

/** Every client's folder: their own copy of whichever buildings a broker has
 * added from the shared library — never the library itself. See
 * services/building_copy.py on the backend for why each folder holds
 * independent rows instead of a live view onto the library. */
export default async function ClientsPage() {
  const clients = (await api.clients().catch(() => [])).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const live = clients.filter((c) => c.is_live).length;

  return (
    <div>
      <PageHeader
        title="Clients"
        description={
          clients.length
            ? `${clients.length} client folder${clients.length === 1 ? "" : "s"}, ${live} shared live. Each folder holds its own copies of library buildings, so you can edit them for that client without touching the library.`
            : "Each client gets a folder of buildings copied from your library, and one live link to share with them."
        }
        actions={
          <ButtonLink href="/clients/new">
            <Plus size={15} aria-hidden="true" />
            New client
          </ButtonLink>
        }
        showHomeLink={false}
      />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-5">
        {clients.map((c) => (
          <ClientCard key={c.client_id} client={c} />
        ))}
        <NewClientCard label={clients.length === 0 ? "Create your first client" : "New client"} />
      </div>
    </div>
  );
}
