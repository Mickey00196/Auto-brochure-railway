"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** The live-link status strip on a client card in the Clients grid — same
 * markup/behaviour as the one on the client's own folder page (see
 * LiveLinkPanel), just compact enough to sit inside a card footer. */
export function ClientLiveStatusRow({ name, isLive, slug }: { name: string; isLive: boolean; slug: string | null }) {
  const [copied, setCopied] = useState(false);
  const liveUrl = slug && typeof window !== "undefined" ? `${window.location.origin}/s/${slug}` : null;

  async function copy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!liveUrl) return;
    try {
      await navigator.clipboard.writeText(liveUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard access denied — nothing more we can do here */
    }
  }

  if (!isLive || !liveUrl) {
    return <span className="text-[11px] text-muted">Not shared yet</span>;
  }

  return (
    <div className="flex min-h-[20px] items-center gap-1.5 text-[11px] text-success-foreground">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success-foreground" />
      <span className="min-w-0 truncate">Live — {liveUrl.replace(/^https?:\/\//, "")}</span>
      <button
        type="button"
        title="Copy live link"
        aria-label={`Copy live link for ${name}`}
        onClick={copy}
        className="ml-auto shrink-0 text-muted transition hover:text-foreground"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  );
}
