import { notFound } from "next/navigation";
import { serverApi as api } from "@/lib/serverApi";
import { Card, PageHeader } from "@/components/ui";
import { SelectionEditor } from "@/components/SelectionEditor";

/** Opening a saved selection lands here: adjust which buildings are in it,
 * rename the client, duplicate it, or generate its PDF. This is what makes a
 * shortlist reusable — reopen it later instead of rebuilding it. */
export default async function SelectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [selection, buildings] = await Promise.all([
    api.selection(id).catch(() => null),
    api.buildings().catch(() => []),
  ]);
  if (!selection) notFound();

  return (
    <div>
      <PageHeader
        eyebrow="Saved selection"
        title={selection.client_name}
        description="Tick or untick buildings from your library, then save, generate the PDF, or duplicate this as a starting point for another client."
      />

      {buildings.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">Your library is empty — add a building first.</p>
        </Card>
      ) : (
        <SelectionEditor selection={selection} buildings={buildings} />
      )}
    </div>
  );
}
