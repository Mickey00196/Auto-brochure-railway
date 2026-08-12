"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { PROXY_BASE_URL } from "@/lib/api";
import { fieldInputClass } from "@/components/ui";

const pillDarkClass =
  "rounded-full bg-[rgba(30,58,138,0.72)] px-2.5 py-1 text-[11px] font-semibold text-white";

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
  const [reordering, setReordering] = useState(false);
  const checkedRef = useRef<string>("");

  const photos = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const commit = (next: string[]) => onChange(next.join(", "));

  function remove(url: string) {
    commit(photos.filter((p) => p !== url));
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= photos.length) return;
    const next = [...photos];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
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

    function Thumb({ src, index, extra }: { src: string; index: number; extra?: ReactNode }) {
      return (
        <div
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
          {extra}
          {reordering ? (
            <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-black/55 py-1">
              <button
                type="button"
                onClick={() => move(index, -1)}
                aria-label="Move earlier"
                className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-xs text-white hover:bg-white/35"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                aria-label="Move later"
                className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-xs text-white hover:bg-white/35"
              >
                ›
              </button>
            </div>
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
    }

    return (
      <div>
        {statusRow}
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
                <button type="button" onClick={() => setReordering((r) => !r)} className={pillDarkClass}>
                  {reordering ? "Done" : "Reorder"}
                </button>
                <button type="button" onClick={() => commit([])} className={pillDarkClass}>
                  Remove all
                </button>
              </div>
              {reordering && rest.length > 0 && (
                <button
                  type="button"
                  onClick={() => move(0, 1)}
                  aria-label="Move this photo later"
                  className={`absolute bottom-2.5 right-2.5 ${pillDarkClass}`}
                >
                  Move later ›
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 grid-rows-2 gap-2">
              {thumbs.map((src, i) => (
                <Thumb
                  key={src}
                  src={src}
                  index={i + 1}
                  extra={
                    i === thumbs.length - 1 && overflow > 0 ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-[rgba(30,58,138,0.6)] text-sm font-bold text-white">
                        +{overflow}
                      </div>
                    ) : undefined
                  }
                />
              ))}
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
          Hover a thumbnail and click × to drop it, or Reorder to move photos — they appear in the client PDF in
          this order.
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
