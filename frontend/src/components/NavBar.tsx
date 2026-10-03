"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Users } from "lucide-react";
import { LogoutButton } from "@/components/LogoutButton";
import { NavHistoryButtons } from "@/components/NavHistoryButtons";

/** Matches Lovable's SiteHeader exactly — just "Building library" and
 * "Clients". Add Building and Import are still real, working routes (reached
 * via the "+ Add building" button, the Chrome extension, and direct links),
 * they're just not in the top nav, same as the approved design. */
const LINKS = [
  { href: "/buildings", label: "Building library", icon: Building2 },
  { href: "/clients", label: "Clients", icon: Users },
];

export function NavBar({ user }: { user?: { name: string; email: string } | null }) {
  const pathname = usePathname();

  // A client's shareable live link (/s/[slug]) is opened by someone with no
  // account at all — every link above would just bounce them to /login, and
  // showing internal broker navigation on a page meant for a client to view
  // is the wrong audience entirely. See proxy.ts, which already lets this
  // one path through with no session.
  if (pathname.startsWith("/s/")) return null;

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur-sm">
      <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-2">
        <div className="flex items-center gap-2">
          <NavHistoryButtons />
          <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold text-dark">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-dark text-white">
              <Building2 size={17} />
            </span>
            Office Shortlist
          </Link>
        </div>
        <nav className="flex flex-wrap items-center gap-1">
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
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium transition ${
                  active ? "bg-input-bg text-dark" : "text-muted hover:bg-input-bg hover:text-foreground"
                }`}
              >
                <link.icon size={14} />
                {link.label}
              </Link>
            );
          })}
          {user && (
            <span className="ml-4 flex items-center gap-3 border-l border-border pl-4 text-sm">
              <span className="text-muted">{user.name}</span>
              <LogoutButton />
            </span>
          )}
        </nav>
      </div>
    </header>
  );
}
