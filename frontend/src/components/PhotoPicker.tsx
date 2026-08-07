"use client";

import { useState } from "react";

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
