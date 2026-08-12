import { notFound } from "next/navigation";
import { serverApi as api } from "@/lib/serverApi";
import { PageHeader } from "@/components/ui";
import { ClientFolder } from "@/components/ClientFolder";

/** A client's folder: the buildings a broker has copied in from the shared
 * library for this client specifically, independent from the library and
 * from every other client's folder. */
export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await api.client(id).catch(() => null);
  if (!client) notFound();

  const buildings = await api.buildings(id).catch(() => []);

  return (
    <div>
      <PageHeader
        eyebrow="Client folder"
        title={client.display_name}
        description="Buildings copied in from your shared library for this client. Editing a copy here never changes the library, and editing the library never changes what's copied here."
      />
      <ClientFolder client={client} buildings={buildings} />
    </div>
  );
}
