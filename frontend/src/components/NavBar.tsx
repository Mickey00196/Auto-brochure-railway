import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";

/** The whole workflow is three screens: the library you select from, the
 * capture screen that fills it, and saved per-client selections you can
 * reopen, adjust or duplicate. Clients/proposals/other export formats still
 * exist at their URLs but are deliberately out of the primary flow. */
const LINKS = [
  { href: "/buildings", label: "Building library" },
  { href: "/buildings/new", label: "Add building" },
  { href: "/selections", label: "Client selections" },
];

export function NavBar({ user }: { user?: { name: string; email: string } | null }) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-sm font-bold tracking-wide text-accent">OFFICE SHORTLIST</span>
          <span className="hidden text-sm text-muted sm:inline">Real Estate Proposal Engine</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm font-medium">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-muted transition hover:text-foreground">
              {link.label}
            </Link>
          ))}
          {user && (
            <span className="flex items-center gap-3 border-l border-border pl-6">
              <span className="text-muted">{user.name}</span>
              <LogoutButton />
            </span>
          )}
        </nav>
      </div>
    </header>
  );
}
