import Link from "next/link";
import { serverApi as api } from "@/lib/serverApi";
import { Button, Card, PageHeader } from "@/components/ui";
import { BuildingLibrary } from "@/components/BuildingLibrary";

/** The home of the tool: everything captured, ever, reusable for any client.
 * Select any subset here and generate that client's PDF. */
export default async function BuildingsPage() {
  let buildings: Awaited<ReturnType<typeof api.buildings>> = [];
  let error: string | null = null;
  try {
    buildings = await api.buildings();
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not reach the database";
  }

  return (
    <div>
      <PageHeader
        title="Building library"
        description="Every building you've captured, kept exactly as saved. Tick the ones that fit a client's search and generate their PDF."
        actions={
          <Link href="/buildings/new">
            <Button>+ Add building</Button>
          </Link>
        }
        showHomeLink={false}
      />

      {error ? (
        <Card className="border-red-300 bg-red-50 text-red-700">
          <p className="font-medium">Can&apos;t reach the database right now.</p>
          <p className="mt-1 text-sm">
            Your saved buildings are safe — this is a connection problem, not data loss. Try again in a moment. ({error})
          </p>
        </Card>
      ) : (
        <BuildingLibrary buildings={buildings} />
      )}
    </div>
  );
}
