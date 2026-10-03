"use client";

import { useState } from "react";
import type { Client } from "@/lib/types";
import { api } from "@/lib/api";
import { Button } from "@/components/ui";

/** The client-folder "Live link" card: a real, working shareable read-only
 * page (see /s/[slug] and the backend's /public/clients/{slug}) — not a
 * visual mock. Turning it on generates a slug once (kept across future
 * toggles, so a link already sent out never silently breaks) and the
 * buildings below become visible to anyone with the link, no login
 * required. */
export function LiveLinkPanel({ client, onUpdated }: { client: Client; onUpdated: (next: Client) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const liveUrl =
    client.public_slug && typeof window !== "undefined"
      ? `${window.location.origin}/s/${client.public_slug}`
      : client.public_slug
        ? `/s/${client.public_slug}`
        : null;

  async function setLive(enable: boolean) {
    setBusy(true);
    setError(null);
    try {
      const next = await api.setClientLive(client.client_id, enable);
      onUpdated(next);
      setConfirming(false);
      if (!enable) {
        setQrOpen(false);
        setCopied(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the live link");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!liveUrl) return;
    try {
      await navigator.clipboard.writeText(liveUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard access denied — the link is still right there to select by hand */
    }
  }

  return (
    <section aria-label="Live client link" className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="h-1 bg-accent" />
      <div className="p-5 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-accent">Share buildings</p>
            <h2 className="mt-2 text-xl font-semibold">One link, always up to date.</h2>
          </div>
          {confirming ? (
            <div role="group" aria-label="Confirm live link" className="flex max-w-full flex-wrap items-center gap-2 rounded-lg bg-warn-bg px-3 py-2">
              <p className="max-w-56 text-xs">Buildings become visible to anyone with the link.</p>
              <Button type="button" onClick={() => setLive(true)} disabled={busy} className="h-8 px-3 text-xs">
                Confirm
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
              disabled={busy}
              onClick={() => (client.is_live ? setLive(false) : setConfirming(true))}
              className={`inline-flex h-9 items-center gap-2 rounded-full px-3 text-xs font-semibold transition disabled:opacity-60 ${
                client.is_live ? "bg-success-bg text-success-foreground" : "bg-input-bg text-muted"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${client.is_live ? "bg-success-foreground" : "bg-muted"}`} />
              {client.is_live ? "Live" : "Not shared yet"}
            </button>
          )}
        </div>

        {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

        {client.is_live && liveUrl && (
          <>
            <div className="mt-6 flex flex-col gap-3 rounded-lg border border-border bg-input-bg p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
              <span className="min-w-0 break-all font-mono text-sm font-semibold sm:text-base">
                {liveUrl.replace(/^https?:\/\//, "")}
              </span>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button type="button" onClick={copyLink} className="h-9 text-xs">
                  {copied ? "Copied" : "Copy link"}
                </Button>
                <a href={liveUrl} target="_blank" rel="noopener noreferrer">
                  <Button type="button" variant="ghost" className="h-9 text-xs">
                    Open ↗
                  </Button>
                </a>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setQrOpen((o) => !o)}
                  aria-label="Show QR preview"
                  title="Show QR preview"
                  className="h-9 w-9 px-0 text-xs"
                >
                  QR
                </Button>
              </div>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              Anyone with this link can view the buildings below — no login required.
            </p>
            {qrOpen && (
              <div className="mt-4 flex items-center gap-3 border-t border-border pt-4 text-muted">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-dashed border-border text-[9px]">
                  QR
                </div>
                <p className="text-xs">QR preview only — a scannable code isn&apos;t generated yet.</p>
              </div>
            )}
          </>
        )}

        {!client.is_live && (
          <p className="mt-4 text-xs leading-relaxed text-muted">
            Turn on the link to share these buildings with anyone who has it.
          </p>
        )}
      </div>
    </section>
  );
}
