import Link from "next/link";
import { serverApi as api } from "@/lib/serverApi";
import { Button } from "@/components/ui";
import { ClientSearch } from "@/components/ClientSearch";

export default async function HomePage() {
  const [clients, buildings] = await Promise.all([
    api.clients().catch(() => []),
    api.buildings().catch(() => []),
  ]);

  return (
    <div>
      {/* Centered hero — the search bar below is the one thing this page
          wants you to do. Confidence here comes from restraint and
          whitespace, not a wall of competing calls to action. */}
      <div className="flex flex-col items-center py-10 text-center sm:py-16">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-dark text-white">
          <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M2 13.5V5l5-3 5 3v8.5M4.5 13.5v-4h2.5v4M9 13.5v-4h2.5v4M2 13.5h10.5"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <p className="mt-5 text-xs font-bold uppercase tracking-wide text-accent">Office Shortlist</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          A better way to share your buildings.
        </h1>
        <p className="mt-3 max-w-md text-sm text-muted">
          Capture buildings, collect them for a client, and send one clean brochure.
        </p>

        <div className="mt-9 w-full max-w-xl text-left">
          <ClientSearch clients={clients} />
        </div>
      </div>

      {/* Library stats — secondary, quiet strip. */}
      <section className="mt-6 flex flex-col justify-between gap-4 border-t border-border pt-7 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold">
            {buildings.length} building{buildings.length === 1 ? "" : "s"} in your library
          </p>
          <Link href="/buildings" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
            Browse library →
          </Link>
        </div>
        <Link href="/buildings/new">
          <Button variant="ghost" className="h-9">
            + Capture new
          </Button>
        </Link>
      </section>
    </div>
  );
}
