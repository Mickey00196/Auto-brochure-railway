"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Building2, Download, Home, Search, Users } from "lucide-react";
import { LogoutButton } from "@/components/LogoutButton";
import { NavHistoryButtons } from "@/components/NavHistoryButtons";

export type SidebarClient = { client_id: string; display_name: string; is_live: boolean };

const LINKS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/buildings", label: "Library", icon: Building2 },
  { href: "/import", label: "Import", icon: Download },
] as const;

/** Event the home page's client search listens for — see ClientSearch. */
export const FOCUS_SEARCH_EVENT = "office-shortlist:focus-search";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** The app's navigation: a left sidebar on desktop, a compact top bar on
 * small screens. Search (or ⌘K / Ctrl+K anywhere) jumps to the client search
 * on the home page. */
export function Sidebar({
  user,
  clients,
}: {
  user?: { name: string; email: string } | null;
  clients: SidebarClient[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const live = clients.filter((c) => c.is_live).slice(0, 6);

  function openSearch() {
    if (pathname === "/") window.dispatchEvent(new Event(FOCUS_SEARCH_EVENT));
    else router.push("/");
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (pathname === "/") window.dispatchEvent(new Event(FOCUS_SEARCH_EVENT));
        else router.push("/");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pathname, router]);

  return (
    <>
      {/* Desktop: sticky left rail */}
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-6 border-r border-border bg-surface px-3.5 py-5 lg:flex">
        <div className="flex items-center justify-between gap-1 pl-1.5">
          <Link href="/" className="flex items-center gap-2.5 whitespace-nowrap text-[15px] font-semibold tracking-tight text-foreground">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-dark text-white">
              <Building2 size={15} aria-hidden="true" />
            </span>
            Office Shortlist
          </Link>
          <NavHistoryButtons />
        </div>

        <button
          type="button"
          onClick={openSearch}
          className="flex h-9 items-center gap-2.5 rounded-lg border border-border bg-background/60 px-2.5 text-[13px] text-muted transition-colors hover:border-accent/40 hover:text-foreground"
        >
          <Search size={14} aria-hidden="true" />
          Find a client
          <kbd className="ml-auto rounded-md border border-border bg-surface px-1.5 py-px font-sans text-[11px] font-medium text-muted">
            ⌘K
          </kbd>
        </button>

        <nav aria-label="Main" className="flex flex-col gap-0.5">
          {LINKS.map((link) => {
            const active = isActive(pathname, link.href);
            const count = link.href === "/clients" ? clients.length : null;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors ${
                  active
                    ? "bg-background font-semibold text-foreground"
                    : "text-foreground/75 hover:bg-background/70 hover:text-foreground"
                }`}
              >
                <link.icon size={16} strokeWidth={1.75} aria-hidden="true" className={active ? "text-accent" : ""} />
                {link.label}
                {count != null && count > 0 && (
                  <span className="ml-auto text-xs font-normal tabular-nums text-muted">{count}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {live.length > 0 && (
          <div>
            <p className="mb-1.5 px-2.5 text-xs text-muted">Shared live</p>
            <ul className="flex flex-col gap-0.5">
              {live.map((c) => (
                <li key={c.client_id}>
                  <Link
                    href={`/clients/${c.client_id}`}
                    className={`flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors hover:bg-background/70 ${
                      pathname === `/clients/${c.client_id}` ? "bg-background font-medium" : "text-foreground/80"
                    }`}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success-foreground" aria-hidden="true" />
                    <span className="truncate">{c.display_name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {user && (
          <div className="mt-auto flex items-center gap-2.5 border-t border-border px-2 pt-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-input-bg text-xs font-semibold">
              {initials(user.name || user.email)}
            </span>
            <span className="min-w-0 truncate text-[13px]">{user.name || user.email}</span>
            <span className="ml-auto">
              <LogoutButton />
            </span>
          </div>
        )}
      </aside>

      {/* Small screens: a slim top bar instead of the rail */}
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link href="/" aria-label="Office Shortlist home" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-dark text-white">
            <Building2 size={16} aria-hidden="true" />
          </Link>
          <nav aria-label="Main" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {LINKS.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`shrink-0 rounded-lg px-2.5 py-2 text-[13px] ${
                    active ? "bg-background font-semibold text-foreground" : "text-foreground/75"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          {user && <LogoutButton compact />}
        </div>
      </header>
    </>
  );
}

function initials(name: string): string {
  return name
    .trim()
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
