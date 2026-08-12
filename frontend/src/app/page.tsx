import Link from "next/link";
import { Button, Card } from "@/components/ui";

const PILLARS = [
  {
    title: "Building library",
    description: "Every building you've captured, kept exactly as saved. Tick the ones that fit a client and generate their PDF.",
    href: "/buildings",
  },
  {
    title: "Import market data",
    description: "Paste a listing URL, run a search, or use the bookmarklet — capture goes straight into the library.",
    href: "/import",
  },
  {
    title: "Client selections",
    description: "Saved shortlists of buildings, one per client. Reopen, adjust, or duplicate one instead of starting over.",
    href: "/selections",
  },
];

export default function HomePage() {
  return (
    <div>
      <section className="flex flex-col items-center gap-6 py-16 text-center sm:py-24">
        <div className="text-xs font-bold uppercase tracking-wide text-accent">Office Shortlist</div>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
          The real estate brochure engine.
        </h1>
        <p className="max-w-xl text-lg text-muted">
          Capture office listings, curate a shortlist for a client, and generate a polished PDF brochure in
          minutes.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <Link href="/buildings">
            <Button variant="primary">Open building library</Button>
          </Link>
          <Link href="/buildings/new">
            <Button variant="ghost">+ Add building</Button>
          </Link>
        </div>
      </section>

      <section className="grid gap-6 pb-16 sm:grid-cols-3">
        {PILLARS.map((pillar) => (
          <Link key={pillar.href} href={pillar.href}>
            <Card className="h-full transition hover:border-accent">
              <h2 className="text-lg font-semibold">{pillar.title}</h2>
              <p className="mt-2 text-sm text-muted">{pillar.description}</p>
            </Card>
          </Link>
        ))}
      </section>
    </div>
  );
}
