"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import type { Client } from "@/lib/types";
import { api } from "@/lib/api";
import { Button } from "@/components/ui";

/** The client-folder "Live link" card: a real, working shareable read-only
 * page (see /s/[slug] and the backend's /public/clients/{slug}). Turning it
 * on generates a slug once (kept across future toggles, so a link already
 * sent out never silently breaks) and the buildings below become visible to
 * anyone with the link, no login required. */
export function LiveLinkPanel({ client, onUpdated }: { client: Client; onUpdated: (next: Client) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // The origin only exists in the browser. Rendering "/s/slug" first and the
  // full URL after mount keeps the server HTML and the first client render
  // identical (reading window during render caused a hydration error).
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => {
    queueMicrotask(() => setOrigin(window.location.origin));
  }, []);

  const path = client.public_slug ? `/s/${client.public_slug}` : null;
  const liveUrl = path ? `${origin ?? ""}${path}` : null;

  async function setLive(enable: boolean) {
    setBusy(true);
    setError(null);
    try {
      const next = await api.setClientLive(client.client_id, enable);
      onUpdated(next);
      setConfirming(false);
      if (!enable) setCopied(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the live link");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!path) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard access denied — the link is still right there to select by hand */
    }
  }

  return (
    <section aria-labelledby="live-link-title" className="rounded-[20px] bg-surface p-5 shadow-card sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="live-link-title" className="text-lg font-semibold tracking-tight">
            Live link
          </h2>
          <p className="mt-1 max-w-[52ch] text-sm leading-relaxed text-muted">
            {client.is_live
              ? "Anyone with this link sees the buildings below as a brochure, always up to date. No login needed."
              : "Share the buildings below as one brochure link that stays up to date as you edit this folder."}
          </p>
        </div>
        {confirming ? (
          <div role="group" aria-label="Confirm live link" className="flex flex-wrap items-center gap-2 rounded-2xl bg-warn-bg px-3 py-2">
            <p className="max-w-56 text-xs text-warn-foreground">Anyone with the link will see these buildings.</p>
            <Button type="button" onClick={() => setLive(true)} disabled={busy} className="h-8 px-3 text-xs">
              Turn on
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)} disabled={busy} className="h-8 px-3 text-xs">
              Cancel
            </Button>
          </div>
        ) : (
          <button
            type="button"
            role="switch"
            aria-checked={client.is_live}
            aria-label="Live link"
            disabled={busy}
            onClick={() => (client.is_live ? setLive(false) : setConfirming(true))}
            className="inline-flex items-center gap-3 rounded-full py-1 pl-1 pr-3 text-sm font-medium disabled:opacity-60"
          >
            <span className={`relative h-6 w-11 rounded-full transition-colors ${client.is_live ? "bg-success-foreground" : "bg-border"}`}>
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${client.is_live ? "left-[22px]" : "left-0.5"}`}
              />
            </span>
            {client.is_live ? "On" : "Off"}
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {client.is_live && liveUrl && (
        <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-input-bg p-2 pl-4 sm:flex-row sm:items-center">
          <span className="min-w-0 flex-1 truncate text-sm font-medium" title={liveUrl}>
            {liveUrl.replace(/^https?:\/\//, "")}
          </span>
          <div className="flex shrink-0 gap-2">
            <Button type="button" onClick={copyLink} className="h-9 text-xs">
              {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
            <a
              href={path!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-4 text-xs font-medium hover:bg-background"
            >
              <ExternalLink size={14} aria-hidden="true" />
              Open
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
