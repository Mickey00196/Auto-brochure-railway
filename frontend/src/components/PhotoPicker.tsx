"use client";

import { useEffect, useRef, useState } from "react";
import { PROXY_BASE_URL } from "@/lib/api";
import { fieldInputClass } from "@/components/ui";

const pillDarkClass =
  "rounded-full bg-[rgba(30,58,138,0.72)] px-2.5 py-1 text-[11px] font-semibold text-white";

/** Drag-and-drop reorder, all photos at once — opened from the "Reorder"
 * pill or by clicking the "+N" overflow thumbnail. Plain HTML5 DnD (no
 * library): drag over a tile live-swaps it into that slot, drop just ends
 * the gesture. */
function ReorderModal({
  photos,
  broken,
  onReorder,
  onRemove,
  onClose,
}: {
  photos: string[];
  broken: Record<string, boolean>;
  onReorder: (next: string[]) => void;
  onRemove: (url: string) => void;
  onClose: () => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Reorder photos"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-lg"
      >
        <div className="mb-1 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Reorder photos</h2>
            <p className="mt-1 text-sm text-muted">
              Drag a photo to move it. This is the order they&apos;ll appear in the client PDF.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border px-3 py-1.5 text-sm font-semibold hover:bg-input-bg"
          >
            Done
          </button>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {photos.map((src, i) => (
            <div
              key={src}
              draggable
              onDragStart={(e) => {
                setDragIndex(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragIndex === null || dragIndex === i) return;
                const next = [...photos];
                const [moved] = next.splice(dragIndex, 1);
                next.splice(i, 0, moved);
                setDragIndex(i);
                onReorder(next);
              }}
              onDragEnd={() => setDragIndex(null)}
              className={`group relative aspect-square cursor-grab overflow-hidden rounded-[10px] border active:cursor-grabbing ${
                broken[src] ? "border-amber-400 bg-amber-50" : "border-border bg-input-bg"
              } ${dragIndex === i ? "opacity-50" : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary captured URLs, no fixed domain to allowlist */}
              <img src={src} alt="" draggable={false} className="h-full w-full object-cover" />
              <span className="absolute left-1 top-1 rounded bg-black/55 px-1.5 text-[10px] font-semibold text-white">
                {i + 1}
              </span>
              <button
                type="button"
                onClick={() => onRemove(src)}
                aria-label="Remove this photo"
                title="Remove this photo"
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-sm font-bold leading-none text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The captured gallery, as a reviewable selection rather than a wall of
 * comma-separated text: hover a photo to drop it, spot a broken one, or paste
 * an extra URL. Order is preserved — it's the order they appear in the PDF. */
export function PhotoPicker({
  value,
  onChange,
  variant = "grid",
}: {
  /** Comma-separated URLs — the shape the form already stores. */
  value: string;
  onChange: (next: string) => void;
  /** "grid": even squares (used for a unit's own photos). "gallery": one
   * large hero photo + a 2x2 thumbnail grid, matching the Building card's
   * office_shortlist_redesign_v14 mock. */
  variant?: "grid" | "gallery";
}) {
  const [adding, setAdding] = useState("");
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const [checking, setChecking] = useState(false);
  const [removedDupes, setRemovedDupes] = useState<{ count: number; previous: string } | null>(null);
  const [reorderOpen, setReorderOpen] = useState(false);
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

  const statusRow = (
    <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
      {brokenCount > 0 && (
        <button
          type="button"
          onClick={() => commit(photos.filter((p) => !broken[p]))}
          className="text-amber-600 underline hover:text-amber-700"
        >
          {`Remove ${brokenCount} that won’t load`}
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
  );

  const urlRow = (
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
        className={`flex-1 ${fieldInputClass}`}
      />
      <button
        type="button"
        onClick={add}
        disabled={!adding.trim()}
        className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-40"
      >
        Add
      </button>
    </div>
  );

  if (variant === "gallery") {
    const [main, ...rest] = photos;
    const thumbs = rest.slice(0, 4);
    const overflow = rest.length - thumbs.length;

    return (
      <div>
        {statusRow}
        {reorderOpen && (
          <ReorderModal
            photos={photos}
            broken={broken}
            onReorder={commit}
            onRemove={remove}
            onClose={() => setReorderOpen(false)}
          />
        )}
        {main ? (
          <div className="mb-3.5 grid grid-cols-[1.7fr_1fr] gap-2">
            <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-border bg-input-bg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={main}
                alt=""
                onError={() => setBroken((b) => ({ ...b, [main]: true }))}
                className="h-full w-full object-cover"
              />
              <div className={`absolute bottom-2.5 left-2.5 ${pillDarkClass}`}>
                {photos.length} photo{photos.length === 1 ? "" : "s"}
              </div>
              <div className="absolute right-2.5 top-2.5 flex gap-1.5">
                <button type="button" onClick={() => setReorderOpen(true)} className={pillDarkClass}>
                  Reorder
                </button>
                <button type="button" onClick={() => commit([])} className={pillDarkClass}>
                  Remove all
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 grid-rows-2 gap-2">
              {thumbs.map((src, i) => {
                const isOverflowTile = i === thumbs.length - 1 && overflow > 0;
                return (
                  <div
                    key={src}
                    className={`group relative aspect-square overflow-hidden rounded-[10px] border ${
                      broken[src] ? "border-amber-400 bg-amber-50" : "border-border bg-input-bg"
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
                    {isOverflowTile ? (
                      <button
                        type="button"
                        onClick={() => setReorderOpen(true)}
                        aria-label={`Show and reorder all ${photos.length} photos`}
                        className="absolute inset-0 flex items-center justify-center bg-[rgba(30,58,138,0.6)] text-sm font-bold text-white hover:bg-[rgba(30,58,138,0.75)]"
                      >
                        +{overflow}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => remove(src)}
                        aria-label="Remove this photo"
                        title="Remove this photo"
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-sm font-bold leading-none text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100"
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
              {/* pad empty thumbnail slots so the 2x2 grid stays intact with < 4 extra photos */}
              {Array.from({ length: Math.max(0, 4 - thumbs.length) }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square rounded-[10px] border border-dashed border-border" />
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-3.5 flex aspect-[16/10] items-center justify-center rounded-xl border border-dashed border-border bg-input-bg text-sm text-muted">
            No photos yet
          </div>
        )}
        {urlRow}
        <p className="mt-2 text-xs text-muted">
          Hover a thumbnail and click × to drop it, or Reorder to drag photos into order — they appear in the
          client PDF in this order.
        </p>
      </div>
    );
  }

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
            {`Remove ${brokenCount} that won’t load`}
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
            </div>
          ))}
        </div>
      )}

      {urlRow}
      <p className="mt-2 text-xs text-muted">
        Hover a photo and click × to drop it. They appear in the client PDF in this order.
      </p>
    </div>
  );
}
