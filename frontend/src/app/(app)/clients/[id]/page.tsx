import { notFound } from "next/navigation";
import { serverApi as api } from "@/lib/serverApi";
import { PageHeader } from "@/components/ui";
import { ClientFolder } from "@/components/ClientFolder";
import { DeleteClientButton } from "@/components/DeleteClientButton";

/** A client's folder: the buildings a broker has copied in from the shared
 * library for this client specifically, independent from the library and
 * from every other client's folder. */
export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await api.client(id).catch(() => null);
  if (!client) notFound();

  const buildings = await api.buildings(id).catch(() => []);
  const details = [client.company_name !== client.display_name ? client.company_name : null, client.industry]
    .filter(Boolean)
    .join(", ");
  const contact = client.contacts[0];
  const contactLine = contact?.name ? `Contact: ${contact.name}${contact.role ? `, ${contact.role}` : ""}` : null;

  return (
    <div>
      <PageHeader
        eyebrow="Client folder"
        title={client.display_name}
        description={[details, contactLine].filter(Boolean).join(". ") || undefined}
        actions={<DeleteClientButton client={client} />}
        backHref="/clients"
        backLabel="Clients"
      />
      <ClientFolder client={client} buildings={buildings} />
    </div>
  );
}
