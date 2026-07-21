import Link from "next/link";
import { serverApi as api } from "@/lib/serverApi";
import { Card, PageHeader, StatTile } from "@/components/ui";
import { SeedDemoButton } from "@/components/SeedDemoButton";

export default async function DashboardPage() {
  let dashboard: Awaited<ReturnType<typeof api.dashboard>> | null = null;
  let error: string | null = null;
  try {
    dashboard = await api.dashboard();
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not reach the API";
  }

  return (
    <div>
      <PageHeader
        eyebrow="§18 Dashboard"
        title="Dashboard"
        description="Imported properties, proposal pipeline, and a live Data Completeness check across every active proposal."
        actions={<SeedDemoButton />}
      />

      {error && (
        <Card className="mb-8 border-red-300 bg-red-50 text-red-700">
          Could not reach the API at <code>{process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"}</code>.
          Make sure the backend is running (<code>uvicorn app.main:app --reload</code>). {error}
        </Card>
      )}

      {dashboard && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile label="Buildings" value={dashboard.imported_properties.buildings} />
            <StatTile label="Units" value={dashboard.imported_properties.units} />
            <StatTile label="Generated Documents" value={dashboard.generated_brochures.total} />
            <StatTile
              label="TBD Headline Fields"
              value={dashboard.data_completeness.tbd_field_count}
              tone={dashboard.data_completeness.tbd_field_count > 0 ? "warn" : "default"}
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="text-lg font-semibold">Data Completeness</h2>
              <p className="mt-1 text-sm text-muted">
                Live count of TBD/missing critical fields across {dashboard.data_completeness.active_proposals_checked}{" "}
                active proposal(s) — chase these down before a deck goes out the door (§8, §18, §24).
              </p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between border-b border-border pb-2">
                  <dt className="text-muted">TBD rent / service-charge fields</dt>
                  <dd className="font-semibold">{dashboard.data_completeness.tbd_field_count}</dd>
                </div>
                <div className="flex justify-between pb-2">
                  <dt className="text-muted">Blocking QA issues</dt>
                  <dd className="font-semibold">{dashboard.data_completeness.blocking_qa_issue_count}</dd>
                </div>
              </dl>
            </Card>

            <Card>
              <h2 className="text-lg font-semibold">Proposal Pipeline</h2>
              <p className="mt-1 text-sm text-muted">Proposals by status (§5.6).</p>
              <dl className="mt-4 space-y-2 text-sm">
                {Object.entries(dashboard.proposals_by_status).map(([status, count]) => (
                  <div key={status} className="flex justify-between border-b border-border pb-2 capitalize last:border-none">
                    <dt className="text-muted">{status.replace("_", " ")}</dt>
                    <dd className="font-semibold">{count}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>

          <div className="mt-8 flex flex-wrap gap-4 text-sm">
            <Link href="/buildings" className="text-accent hover:underline">
              Browse buildings & units →
            </Link>
            <Link href="/proposals" className="text-accent hover:underline">
              View proposals →
            </Link>
            <Link href="/clients" className="text-accent hover:underline">
              View clients →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
