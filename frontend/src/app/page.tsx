import Link from "next/link";
import { serverApi as api } from "@/lib/serverApi";
import { Button, Card, PageHeader, StatTile } from "@/components/ui";
import { SeedDemoButton } from "@/components/SeedDemoButton";

/** The home screen is the map of the tool: three steps, in order, with the
 * next useful action on each. Everything else (QA counts, pipeline
 * breakdowns) lives on the pages where it's actionable. */
const STEPS = [
  {
    n: 1,
    title: "Capture a building",
    body: "On a listing page, click the Chrome extension — it reads the page and pre-fills everything it found. No extension to hand? Paste the link instead.",
    href: "/import",
    cta: "Add from a link",
  },
  {
    n: 2,
    title: "Check and save it",
    body: "Review what was captured, fill in anything the listing didn't state, and save. Buildings stay in your database for every future client.",
    href: "/buildings",
    cta: "See saved buildings",
  },
  {
    n: 3,
    title: "Send a client their PDF",
    body: "Pick a client, tick the buildings that fit their brief, and download a clean availability overview as a PDF.",
    href: "/proposals/new",
    cta: "Build a client PDF",
  },
];

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
        title="Office availability, client-ready"
        description="Capture listings from the web, keep them in one place, and turn any selection into a client PDF."
        actions={<SeedDemoButton />}
        showHomeLink={false}
      />

      {error && (
        <Card className="mb-8 border-red-300 bg-red-50 text-red-700">
          <p className="font-medium">The app can&apos;t reach its database service right now.</p>
          <p className="mt-1 text-sm">
            Your saved buildings are safe — this is a connection problem, not data loss. If it doesn&apos;t clear up
            in a minute, check that the backend service is running. ({error})
          </p>
        </Card>
      )}

      {dashboard && (
        <div className="mb-8 grid grid-cols-3 gap-4">
          <StatTile label="Buildings saved" value={dashboard.imported_properties.buildings} />
          <StatTile label="Available units" value={dashboard.imported_properties.units} />
          <StatTile label="Documents generated" value={dashboard.generated_brochures.total} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {STEPS.map((step) => (
          <Card key={step.n} className="flex flex-col">
            <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
              {step.n}
            </div>
            <h2 className="text-lg font-semibold">{step.title}</h2>
            <p className="mt-1 flex-1 text-sm text-muted">{step.body}</p>
            <Link href={step.href} className="mt-4">
              <Button variant={step.n === 3 ? "primary" : "ghost"}>{step.cta}</Button>
            </Link>
          </Card>
        ))}
      </div>

      {dashboard && dashboard.data_completeness.tbd_field_count > 0 && (
        <Card className="mt-6">
          <h2 className="text-base font-semibold">
            {dashboard.data_completeness.tbd_field_count} price field
            {dashboard.data_completeness.tbd_field_count === 1 ? "" : "s"} still marked TBD
          </h2>
          <p className="mt-1 text-sm text-muted">
            These are figures the source listings didn&apos;t state. They print as &ldquo;TBD&rdquo; on a client PDF,
            which is honest but worth chasing down before sending. Open any building to fill them in.
          </p>
        </Card>
      )}
    </div>
  );
}
