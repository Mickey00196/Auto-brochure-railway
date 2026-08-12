"use client";

import { useEffect, useRef, useState } from "react";
import { PROXY_BASE_URL } from "@/lib/api";
import { fieldInputClass } from "@/components/ui";
import { PhotoLightbox } from "@/components/PhotoLightbox";

const pillDarkClass =
  "rounded-full bg-[rgba(30,58,138,0.72)] px-2.5 py-1 text-[11px] font-semibold text-white";
const navCircleClass =
  "flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(30,58,138,0.72)] text-lg font-semibold text-white transition hover:bg-[rgba(30,58,138,0.9)]";
const scrimTopClass =
  "pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/40 to-transparent";
const scrimBottomClass =
  "pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/40 to-transparent";
const hoverImgClass = "transition duration-150 group-hover:brightness-105 group-hover:scale-[1.02]";

/** Drag-and-drop reorder, all photos at once — opened from the "Reorder"
 * pill. Plain HTML5 DnD (no library): drag over a tile live-swaps it into
 * that slot, drop just ends the gesture. */
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
              className={`group relative aspect-square cursor-grab overflow-hidden rounded-xl border active:cursor-grabbing ${
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
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  // Which photo sits in the hero slot — browsing only, doesn't touch the
  // saved order (that's what "Reorder" is for). The ‹ › arrows on the
  // gallery card just step this forward/back.
  const [heroIndex, setHeroIndex] = useState(0);
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

  const dedupeToast = removedDupes && (
    <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-success-bg px-3 py-1.5 text-xs font-medium text-success-foreground">
      <span>
        {`Removed ${removedDupes.count} duplicate${removedDupes.count === 1 ? "" : "s"} automatically`}
      </span>
      <button
        type="button"
        onClick={() => {
          checkedRef.current = removedDupes.previous;
          onChange(removedDupes.previous);
          setRemovedDupes(null);
        }}
        className="font-semibold underline decoration-success-foreground/40 underline-offset-2 hover:decoration-success-foreground"
      >
        Undo
      </button>
    </div>
  );

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
    // heroIndex can drift out of range as photos are added/removed — wrap it
    // back in bounds rather than reset to 0, so removing a later photo
    // doesn't unexpectedly jump the hero back to the first one.
    const safeHeroIndex = photos.length ? ((heroIndex % photos.length) + photos.length) % photos.length : 0;
    const main = photos[safeHeroIndex] as string | undefined;
    // The rest, in original order, starting right after the hero and
    // wrapping around — so stepping the hero forward/back always surfaces
    // "the next/previous photo" without touching the saved order.
    const rest = photos
      .map((src, i) => ({ src, i }))
      .filter((p) => p.i !== safeHeroIndex);
    const rotatedRest = [...rest.slice(safeHeroIndex), ...rest.slice(0, safeHeroIndex)];
    const thumbs = rotatedRest.slice(0, 4);
    const overflow = rotatedRest.length - thumbs.length;
    const stepHero = (delta: number) => setHeroIndex((h) => h + delta);

    return (
      <div>
        {statusRow}
        {dedupeToast}
        <PhotoLightbox
          photos={photos.map((url) => ({ url }))}
          initialIndex={viewerIndex ?? 0}
          open={viewerIndex !== null}
          onClose={() => setViewerIndex(null)}
        />
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
          // A fixed pixel height (not an aspect-ratio) on the row itself,
          // with both columns stretched to h-full. aspect-ratio derives the
          // height from the container's *width*, and — combined with the
          // thumbnails resolving their own height as a percentage (h-full)
          // of that — some browsers fell back to sizing the row off the
          // hero photo's own intrinsic dimensions instead of holding the
          // ratio, so the gallery's height visibly changed photo to photo.
          // 440px matches what the 2.4:1 ratio worked out to at this card's
          // typical width, but as a plain fixed height it can't drift.
          <div className="mb-3.5 grid h-[440px] grid-cols-[1.7fr_1fr] gap-2">
            <div className="group relative h-full overflow-hidden rounded-xl border border-border bg-input-bg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={main}
                alt=""
                onError={() => setBroken((b) => ({ ...b, [main]: true }))}
                onClick={() => setViewerIndex(safeHeroIndex)}
                className={`h-full w-full cursor-pointer object-cover ${hoverImgClass}`}
              />
              <div className={scrimTopClass} />
              <div className={scrimBottomClass} />
              <div className={`pointer-events-none absolute bottom-2.5 left-2.5 ${pillDarkClass}`}>
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
            <div className="grid h-full grid-cols-2 grid-rows-2 gap-2">
              {thumbs.map(({ src, i: photoIndex }, i) => {
                const isOverflowTile = i === thumbs.length - 1 && overflow > 0;
                return (
                  <div
                    key={src}
                    className={`group relative h-full w-full overflow-hidden rounded-xl border ${
                      broken[src] ? "border-amber-400 bg-amber-50" : "border-border bg-input-bg"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary captured URLs, no fixed domain to allowlist */}
                    <img
                      src={src}
                      alt=""
                      loading="lazy"
                      onError={() => setBroken((b) => ({ ...b, [src]: true }))}
                      onClick={() => setViewerIndex(photoIndex)}
                      className={`h-full w-full cursor-pointer object-cover ${hoverImgClass}`}
                    />
                    {isOverflowTile && (
                      // pointer-events-none: clicks pass through to the <img> behind it,
                      // which already opens the lightbox at this same photo.
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[rgba(30,58,138,0.6)] text-sm font-bold text-white">
                        +{overflow}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(src);
                      }}
                      aria-label="Remove this photo"
                      title="Remove this photo"
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-sm font-bold leading-none text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
              {/* pad empty thumbnail slots so the 2x2 grid stays intact with < 4 extra photos */}
              {Array.from({ length: Math.max(0, 4 - thumbs.length) }).map((_, i) => (
                <div key={`empty-${i}`} className="h-full w-full rounded-xl border border-dashed border-border" />
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-3.5 flex h-[440px] items-center justify-center rounded-xl border border-dashed border-border bg-input-bg text-sm text-muted">
            No photos yet
          </div>
        )}
        {main && photos.length > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button type="button" onClick={() => stepHero(-1)} aria-label="Show previous photo as the hero" className={navCircleClass}>
              ‹
            </button>
            <button type="button" onClick={() => stepHero(1)} aria-label="Show next photo as the hero" className={navCircleClass}>
              ›
            </button>
          </div>
        )}
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
      </div>
      {dedupeToast}

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
