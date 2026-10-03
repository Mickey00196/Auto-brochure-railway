"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Client } from "@/lib/types";
import { api } from "@/lib/api";
import { Card } from "@/components/ui";

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function LivePill({ live }: { live: boolean }) {
  return live ? (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success-bg px-2.5 py-1 text-[11px] font-medium text-success-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-success-foreground" />
      Live
    </span>
  ) : (
    <span className="shrink-0 rounded-full bg-input-bg px-2.5 py-1 text-[11px] font-medium text-muted">
      Not shared yet
    </span>
  );
}

/** The home page's single primary interaction: type a client's name to jump
 * straight to their folder, or — if nothing matches — create them on the
 * spot. Replaces a separate "browse recent clients" list and a separate
 * "+ New client" button with one command-bar-style input, the same way
 * typing into Lovable's own landing page both searches and creates. */
export function ClientSearch({ clients }: { clients: Client[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = norm(query);
  const matches = useMemo(() => {
    const sorted = [...clients].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    if (!q) return sorted.slice(0, 4);
    return sorted.filter((c) => norm(c.display_name).includes(q));
  }, [clients, q]);
  const exactMatch = clients.some((c) => norm(c.display_name) === q);

  async function createClient() {
    const name = query.trim();
    if (!name || creating) return;
    setCreating(true);
    setError(null);
    try {
      const created = await api.createClient({ name });
      router.push(`/clients/${created.client_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create this client");
      setCreating(false);
    }
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!exactMatch && query.trim()) createClient();
        }}
      >
        <div className="relative">
          <svg
            width="20"
            height="20"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-muted"
          >
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M11 11 14.5 14.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a client…"
            className="h-16 w-full rounded-2xl border border-border bg-surface pl-14 pr-5 text-lg shadow-sm outline-none transition placeholder:text-placeholder focus:border-accent focus:ring-2 focus:ring-accent/15"
          />
        </div>
      </form>

      <div className="mt-4 flex justify-center">
        <Link
          href="/clients/new"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-dark shadow-sm transition hover:border-accent"
        >
          + New client
        </Link>
      </div>

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

      {query.trim() && !exactMatch && (
        <button
          type="button"
          onClick={createClient}
          disabled={creating}
          className="mt-4 flex w-full items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3 text-left transition hover:border-accent hover:bg-input-bg disabled:opacity-60"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-dark text-sm font-bold text-white">
            +
          </span>
          <span className="text-sm font-semibold">
            {creating ? "Creating…" : <>Create &ldquo;{query.trim()}&rdquo;</>}
          </span>
        </button>
      )}

      <div className="mt-8">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            {q ? `${matches.length} match${matches.length === 1 ? "" : "es"}` : "Recent clients"}
          </h2>
          {!q && (
            <Link href="/clients/new" className="text-xs font-semibold text-accent hover:underline">
              + New client
            </Link>
          )}
        </div>

        {matches.length === 0 ? (
          <Card className="mt-5 border-dashed text-center">
            <p className="text-sm font-semibold">{q ? `No client named "${query.trim()}"` : "No clients yet"}</p>
            <p className="mt-1 text-xs text-muted">
              {q ? "Create them with the button above." : "Search above to add your first client."}
            </p>
          </Card>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {matches.map((c) => (
              <Link key={c.client_id} href={`/clients/${c.client_id}`} className="group">
                <Card className="flex h-full min-h-[136px] flex-col justify-between transition hover:border-accent">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-input-bg text-xs font-bold text-dark">
                        {initials(c.display_name)}
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold group-hover:text-accent">{c.display_name}</h3>
                        <p className="mt-0.5 text-xs text-muted">
                          {c.building_count} {c.building_count === 1 ? "building" : "buildings"}
                        </p>
                      </div>
                    </div>
                    <LivePill live={c.is_live} />
                  </div>
                  <p className="mt-5 text-[11px] text-muted">
                    Updated {new Date(c.updated_at).toLocaleDateString()}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
