"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { NavHistoryButtons } from "@/components/NavHistoryButtons";

/** The whole workflow is four screens: importing/capturing buildings, the
 * shared library they land in, the capture form, and each client's own
 * folder of buildings copied in from that library. The old Proposals/export
 * workflow (a second, QA-gated way to build a client PDF) has been retired —
 * the client-folder PDF is the one path now. */
const LINKS = [
  { href: "/buildings", label: "Building library" },
  { href: "/buildings/new", label: "Add building" },
  { href: "/import", label: "Import" },
  { href: "/clients", label: "Clients" },
];

export function NavBar({ user }: { user?: { name: string; email: string } | null }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-4">
        <div className="flex items-center gap-3">
          <NavHistoryButtons />
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-sm font-bold tracking-wide text-accent">OFFICE SHORTLIST</span>
            <span className="hidden text-sm text-muted sm:inline">Real Estate Brochure Engine</span>
          </Link>
        </div>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium">
          {LINKS.map((link) => {
            // Exact match for the library root; startsWith for everything
            // else so a detail/sub-route (e.g. /clients/abc123) still lights
            // up its section's link instead of showing no active state.
            const active =
              link.href === "/buildings" ? pathname === "/buildings" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`transition hover:text-foreground ${active ? "font-semibold text-foreground" : "text-muted"}`}
              >
                {link.label}
              </Link>
            );
          })}
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
