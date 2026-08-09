import { serverApi as api } from "@/lib/serverApi";
import { Card, PageHeader } from "@/components/ui";
import { SelectionsList } from "@/components/SelectionsList";

/** The counterpart to the library: every saved shortlist, one per client (or
 * per pitch to a client), so a broker can reopen, adjust, or duplicate one
 * instead of re-picking buildings from scratch each time. */
export default async function SelectionsPage() {
  let selections: Awaited<ReturnType<typeof api.selections>> = [];
  let buildings: Awaited<ReturnType<typeof api.buildings>> = [];
  let error: string | null = null;
  try {
    [selections, buildings] = await Promise.all([api.selections(), api.buildings()]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not reach the database";
  }

  return (
    <div>
      <PageHeader
        title="Client selections"
        description="Saved shortlists of buildings, one per client. Open one to adjust which buildings are in it, or duplicate it as a starting point for a similar client."
      />

      {error ? (
        <Card className="border-red-300 bg-red-50 text-red-700">
          <p className="font-medium">Can&apos;t reach the database right now.</p>
          <p className="mt-1 text-sm">
            Your saved selections are safe — this is a connection problem, not data loss. Try again in a moment. ({error})
          </p>
        </Card>
      ) : (
        <SelectionsList selections={selections} buildings={buildings} />
      )}
    </div>
  );
}
