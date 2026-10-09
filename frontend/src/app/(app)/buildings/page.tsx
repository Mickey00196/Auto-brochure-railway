import { Download, Plus } from "lucide-react";
import { serverApi as api } from "@/lib/serverApi";
import { ButtonLink, PageHeader } from "@/components/ui";
import { BuildingLibrary } from "@/components/BuildingLibrary";

/** The home of the tool: everything captured, ever, reusable for any client. */
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
        title="Library"
        description="Every building you've captured, ready to add to any client's shortlist."
        actions={
          <>
            <ButtonLink href="/import" variant="ghost">
              <Download size={15} aria-hidden="true" />
              Import links
            </ButtonLink>
            <ButtonLink href="/buildings/new">
              <Plus size={15} aria-hidden="true" />
              Capture building
            </ButtonLink>
          </>
        }
        showHomeLink={false}
      />

      {error ? (
        <div className="rounded-[18px] bg-red-50 p-6 text-red-800">
          <p className="font-semibold">Can&apos;t reach the database right now.</p>
          <p className="mt-1 text-sm">
            Your saved buildings are safe — this is a connection problem, not data loss. Try again in a moment. ({error})
          </p>
        </div>
      ) : (
        <BuildingLibrary buildings={buildings} />
      )}
    </div>
  );
}
