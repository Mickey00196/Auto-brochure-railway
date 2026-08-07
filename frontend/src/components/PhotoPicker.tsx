"use client";

import { useEffect, useRef, useState } from "react";
import { PROXY_BASE_URL } from "@/lib/api";

/** The captured gallery, as a reviewable selection rather than a wall of
 * comma-separated text: hover a photo to drop it, spot a broken one, or paste
 * an extra URL. Order is preserved — it's the order they appear in the PDF. */
export function PhotoPicker({
  value,
  onChange,
}: {
  /** Comma-separated URLs — the shape the form already stores. */
  value: string;
  onChange: (next: string) => void;
}) {
  const [adding, setAdding] = useState("");
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const [checking, setChecking] = useState(false);
  const [removedDupes, setRemovedDupes] = useState<{ count: number; previous: string } | null>(null);
  const checkedRef = useRef<string>("");

  const photos = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const commit = (next: string[]) => onChange(next.join(", "));

  function remove(url: string) {
    commit(photos.filter((p) => p !== url));
  }

  function add() {
    const url = adding.trim();
    if (!url) return;
    if (!photos.includes(url)) commit([...photos, url]);
    setAdding("");
  }

  const brokenCount = photos.filter((p) => broken[p]).length;

  // A listing can publish the same shot under completely unrelated URLs, so
  // matching on the address alone can't catch it — the server compares the
  // decoded images (the browser can't: a cross-origin CDN image taints the
  // canvas). Duplicates are removed automatically, with an undo, because the
  // whole point is not having to weed them out by hand.
  useEffect(() => {
    const signature = photos.join(",");
    if (photos.length < 2 || checkedRef.current === signature) return;
    checkedRef.current = signature;
    let cancelled = false;
    setChecking(true);
    fetch(`${PROXY_BASE_URL}/photos/duplicates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: photos }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { keep: string[]; duplicates: string[] } | null) => {
        if (cancelled || !body || body.duplicates.length === 0) return;
        checkedRef.current = body.keep.join(",");
        setRemovedDupes({ count: body.duplicates.length, previous: signature });
        commit(body.keep);
      })
      .catch(() => {
        /* detection is a convenience — never block editing on it */
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the URL list itself
  }, [value]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
        <span className="font-medium">
          {photos.length} photo{photos.length === 1 ? "" : "s"} selected
        </span>
        {brokenCount > 0 && (
          <button
            type="button"
            onClick={() => commit(photos.filter((p) => !broken[p]))}
            className="text-amber-600 underline hover:text-amber-700"
          >
            {`Remove ${brokenCount} that won\u2019t load`}
          </button>
        )}
        {photos.length > 0 && (
          <button
            type="button"
            onClick={() => commit([])}
            className="text-muted underline hover:text-foreground"
          >
            Remove all
          </button>
        )}
        {checking && <span className="text-muted">Checking for duplicates…</span>}
        {removedDupes && (
          <span className="text-muted">
            {`Removed ${removedDupes.count} duplicate${removedDupes.count === 1 ? "" : "s"}`}{" "}
            <button
              type="button"
              onClick={() => {
                checkedRef.current = removedDupes.previous;
                onChange(removedDupes.previous);
                setRemovedDupes(null);
              }}
              className="underline hover:text-foreground"
            >
              Undo
            </button>
          </span>
        )}
      </div>

      {photos.length > 0 && (
        <div className="mb-3 grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2">
          {photos.map((src, i) => (
            <div
              key={src}
              className={`group relative aspect-square overflow-hidden rounded-lg border ${
                broken[src] ? "border-amber-400 bg-amber-50" : "border-border"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary captured URLs, no fixed domain to allowlist */}
              <img
                src={src}
                alt=""
                loading="lazy"
                onError={() => setBroken((b) => ({ ...b, [src]: true }))}
                className="h-full w-full object-cover"
              />
              <span className="absolute left-1 top-1 rounded bg-black/55 px-1.5 text-[10px] font-semibold text-white">
                {i + 1}
              </span>
              <button
                type="button"
                onClick={() => remove(src)}
                aria-label={`Remove photo ${i + 1}`}
                title="Remove this photo"
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-sm font-bold leading-none text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100"
              >
                ×
              </button>
              {broken[src] && (
                <span className="absolute inset-x-0 bottom-0 bg-amber-100/90 px-1 py-0.5 text-center text-[9px] text-amber-800">
                  won&apos;t load
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          type="url"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // This lives inside the building form — Enter must not submit it.
              e.preventDefault();
              add();
            }
          }}
          placeholder="Paste another photo URL…"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={add}
          disabled={!adding.trim()}
          className="rounded-full border border-border px-3 py-2 text-sm font-semibold disabled:opacity-40"
        >
          Add
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">
        Hover a photo and click × to drop it. They appear in the client PDF in this order.
      </p>
    </div>
  );
}
