"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Link2, Plus } from "lucide-react";
import type { Client } from "@/lib/types";

/** Fixed locale + time zone so the server render and the browser agree
 * (a bare toLocaleDateString() differs between them → hydration error). */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Amsterdam" });
}

function summary(client: Client): string {
  const n = client.building_count;
  if (n === 0) return "No buildings yet";
  const count = `${n} building${n === 1 ? "" : "s"}`;
  const areas = client.areas ?? [];
  if (areas.length === 0) return count;
  if (areas.length === 1) return `${count} in ${areas[0]}`;
  if (areas.length === 2) return `${count} in ${areas[0]} and ${areas[1]}`;
  return `${count} in ${areas[0]}, ${areas[1]} and more`;
}

function Tile({ src, className = "", children }: { src?: string; className?: string; children?: React.ReactNode }) {
  return (
    <span className={`relative overflow-hidden rounded-xl bg-input-bg ${className}`}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary captured URLs, no fixed domain to allowlist
        <img src={src} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      )}
      {children}
    </span>
  );
}

/** A client folder on the overview: a mosaic of its buildings' photos, its
 * name, where its buildings are, and whether its live link is on. The whole
 * card is one link; the copy-link button sits above it. */
export function ClientCard({ client }: { client: Client }) {
  const photos = client.preview_photos ?? [];
  const extra = client.building_count - 3;
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    if (!client.public_slug) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/s/${client.public_slug}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the link is one click away on the folder page */
    }
  }

  return (
    <div className="group relative flex flex-col rounded-[20px] bg-surface p-2.5 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-float">
      <Link
        href={`/clients/${client.client_id}`}
        aria-label={`Open ${client.display_name}`}
        className="absolute inset-0 z-0 rounded-[20px]"
      />
      <span className="pointer-events-none grid h-[168px] grid-cols-[1.6fr_1fr] grid-rows-2 gap-1.5" aria-hidden="true">
        {client.building_count === 0 ? (
          <Tile className="col-span-2 row-span-2 flex items-center justify-center text-sm text-muted">
            Empty folder
          </Tile>
        ) : (
          <>
            <Tile src={photos[0]} className="row-span-2" />
            <Tile src={photos[1]} />
            <Tile src={photos[2]}>
              {extra > 0 && (
                <span className="absolute inset-0 flex items-center justify-center bg-[rgb(15_27_51/0.55)] text-sm font-semibold text-white">
                  +{extra}
                </span>
              )}
            </Tile>
          </>
        )}
      </span>

      <div className="pointer-events-none px-2.5 pb-2 pt-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="truncate text-[17px] font-semibold tracking-[-0.01em] group-hover:text-accent">
            {client.display_name}
          </h3>
          {client.is_live ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-success-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-success-foreground" aria-hidden="true" />
              Live
            </span>
          ) : (
            <span className="shrink-0 text-xs text-muted">Not shared</span>
          )}
        </div>
        <p className="mt-1 truncate text-sm text-muted">{summary(client)}</p>
        <p className="mt-0.5 text-xs text-muted/80">Updated {shortDate(client.updated_at)}</p>
      </div>

      {client.is_live && client.public_slug && (
        <button
          type="button"
          onClick={copyLink}
          aria-label={`Copy the live link for ${client.display_name}`}
          title="Copy live link"
          className="absolute right-4 top-4 z-10 inline-flex h-8 items-center gap-1.5 rounded-full bg-surface/95 px-3 text-xs font-medium text-foreground shadow-card backdrop-blur transition hover:bg-surface"
        >
          {copied ? <Check size={13} aria-hidden="true" /> : <Link2 size={13} aria-hidden="true" />}
          {copied ? "Copied" : "Copy link"}
        </button>
      )}
    </div>
  );
}

/** The dashed "add" tile that ends a grid of client cards. */
export function NewClientCard({ label = "New client", hint = "Create a folder, then add buildings from your library." }: { label?: string; hint?: string }) {
  return (
    <Link
      href="/clients/new"
      className="flex min-h-[262px] flex-col justify-center gap-3 rounded-[20px] border-[1.5px] border-dashed border-border p-7 transition-colors hover:border-accent/50 hover:bg-surface/50"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-dark text-white">
        <Plus size={17} aria-hidden="true" />
      </span>
      <span className="text-[17px] font-semibold tracking-tight">{label}</span>
      <span className="max-w-[30ch] text-sm leading-relaxed text-muted">{hint}</span>
    </Link>
  );
}
