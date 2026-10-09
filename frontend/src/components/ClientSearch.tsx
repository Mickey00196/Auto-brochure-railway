"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import type { Client } from "@/lib/types";
import { api } from "@/lib/api";
import { ClientCard, NewClientCard } from "@/components/ClientCard";
import { FOCUS_SEARCH_EVENT } from "@/components/Sidebar";

const HOME_LIMIT = 8;

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** The home page: one search over every client folder, sitting in the navy
 * hero, with the folders as cards underneath. Enter opens the best match;
 * a brand-new name is only created through the explicit "Create" card, so a
 * half-typed name can't quietly make a duplicate client. */
export function ClientSearch({ clients }: { clients: Client[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    window.addEventListener(FOCUS_SEARCH_EVENT, focus);
    return () => window.removeEventListener(FOCUS_SEARCH_EVENT, focus);
  }, []);

  const q = norm(query);
  const sorted = useMemo(() => [...clients].sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [clients]);
  const matches = q ? sorted.filter((c) => norm(c.display_name).includes(q)) : sorted.slice(0, HOME_LIMIT);
  const exactMatch = clients.find((c) => norm(c.display_name) === q);

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const target = exactMatch ?? matches[0];
    if (q && target) router.push(`/clients/${target.client_id}`);
  }

  return (
    <div>
      <section className="rounded-[28px] bg-dark px-6 pb-28 pt-12 text-white sm:px-12 sm:pt-14">
        <h1 className="text-[44px] font-semibold leading-none tracking-[-0.035em] sm:text-[60px]">Find a client</h1>
        <p className="mt-4 max-w-[48ch] text-base leading-relaxed text-white/75 sm:text-[17px]">
          Open a client&apos;s folder to add buildings and share their live shortlist, or start a new one.
        </p>
        <form role="search" onSubmit={handleSubmit} className="mt-9 flex flex-wrap gap-3">
          <div className="relative min-w-0 flex-[1_1_380px]">
            <label htmlFor="client-search" className="sr-only">
              Find a client
            </label>
            <Search size={20} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              id="client-search"
              ref={inputRef}
              type="search"
              autoFocus
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Client or company name"
              className="h-[60px] w-full rounded-2xl border-0 bg-white pl-14 pr-5 text-[17px] text-[#0f1b33] placeholder:text-[#7c8699] outline-none focus:ring-4 focus:ring-white/25"
            />
          </div>
          <Link
            href="/clients/new"
            className="inline-flex h-[60px] items-center gap-2 rounded-2xl border border-white/35 px-6 text-[15px] font-medium text-white transition-colors hover:bg-white/10"
          >
            <Plus size={16} aria-hidden="true" />
            New client
          </Link>
        </form>
      </section>

      <div className="-mt-[72px] px-3 sm:px-6">
        {error && <p className="mb-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-5">
          {q && !exactMatch && (
            <button
              type="button"
              onClick={createClient}
              disabled={creating}
              className="flex min-h-[262px] flex-col justify-center gap-3 rounded-[20px] bg-surface p-7 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-float disabled:opacity-60"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-white">
                <Plus size={17} aria-hidden="true" />
              </span>
              <span className="text-[17px] font-semibold tracking-tight">
                {creating ? "Creating…" : <>Create &ldquo;{query.trim()}&rdquo;</>}
              </span>
              <span className="text-sm text-muted">Start a new client folder with this name.</span>
            </button>
          )}
          {matches.map((c) => (
            <ClientCard key={c.client_id} client={c} />
          ))}
          {!q && <NewClientCard label={clients.length === 0 ? "Create your first client" : "New client"} />}
        </div>
        {!q && clients.length > HOME_LIMIT && (
          <div className="mt-6 text-center">
            <Link href="/clients" className="text-sm font-medium text-accent hover:underline">
              See all {clients.length} clients
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
