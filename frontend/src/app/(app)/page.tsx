import { serverApi as api } from "@/lib/serverApi";
import { ClientSearch } from "@/components/ClientSearch";

export default async function HomePage() {
  const clients = await api.clients().catch(() => []);
  return <ClientSearch clients={clients} />;
}
