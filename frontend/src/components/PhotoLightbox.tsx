"use client";

import { useEffect, useRef, useState } from "react";

export interface LightboxPhoto {
  url: string;
  alt?: string;
}

const chevronClass =
  "flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl text-white backdrop-blur transition hover:bg-white/20";

/** A real lightbox — full-screen takeover, Next/Back with wraparound,
 * keyboard + swipe + backdrop-click navigation, a filmstrip to jump
 * directly to a photo, and the next/previous images preloaded so paging
 * never shows a loading flash. Kept always-mounted by the caller (`open`
 * toggles visibility) so the close fade can actually play instead of the
 * component just vanishing. */
export function PhotoLightbox({
  photos,
  initialIndex,
  open,
  onClose,
}: {
  photos: LightboxPhoto[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [rendered, setRendered] = useState(open);
  const [visible, setVisible] = useState(false);
  const [imgVisible, setImgVisible] = useState(true);
  const touchStartX = useRef<number | null>(null);

  // Jump to whatever photo was clicked each time the lightbox is (re)opened.
  // Deferred a tick (queueMicrotask): calling setState synchronously in the
  // effect body trips react-hooks/set-state-in-effect (cascading-render
  // risk), even though this only reacts to `open` flipping.
  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => setIndex(initialIndex));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately only on open, not initialIndex changing while already open
  }, [open]);

  // Mount before fading in, fade out before unmounting — a plain `open &&
  // <Lightbox/>` in the caller can't play an exit transition since the
  // element is gone the instant `open` flips.
  useEffect(() => {
    let raf = 0;
    let timeout: ReturnType<typeof setTimeout>;
    if (open) {
      queueMicrotask(() => setRendered(true));
      raf = requestAnimationFrame(() => setVisible(true));
    } else {
      queueMicrotask(() => setVisible(false));
      timeout = setTimeout(() => setRendered(false), 200);
    }
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
    };
  }, [open]);

  useEffect(() => {
    if (!rendered) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [rendered]);

  const go = (delta: number) => {
    setIndex((i) => (i + delta + photos.length) % photos.length);
  };

  // A brief fade on the image itself each time the index changes — close
  // enough to a crossfade without double-buffering two <img> elements.
  useEffect(() => {
    queueMicrotask(() => setImgVisible(false));
    const raf = requestAnimationFrame(() => setImgVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [index]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- go()/onClose are stable enough for this
  }, [open, photos.length]);

  if (!rendered) return null;

  const current = photos[index];
  const next = photos[(index + 1) % photos.length];
  const prev = photos[(index - 1 + photos.length) % photos.length];

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      onClick={onClose}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return;
        const delta = e.changedTouches[0].clientX - touchStartX.current;
        if (Math.abs(delta) > 50) go(delta > 0 ? -1 : 1);
        touchStartX.current = null;
      }}
      role="presentation"
    >
      {/* Preload neighbors so Next/Back never shows a load flash. */}
      {photos.length > 1 && (
        <div className="hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={next.url} alt="" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={prev.url} alt="" />
        </div>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close"
        className={`absolute right-4 top-4 ${chevronClass} text-xl`}
      >
        ×
      </button>

      {photos.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            aria-label="Previous photo"
            className={`absolute left-3 top-1/2 -translate-y-1/2 sm:left-6 ${chevronClass}`}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            aria-label="Next photo"
            className={`absolute right-3 top-1/2 -translate-y-1/2 sm:right-6 ${chevronClass}`}
          >
            ›
          </button>
        </>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary captured URLs, no fixed domain to allowlist */}
      <img
        src={current.url}
        alt={current.alt ?? ""}
        onClick={(e) => e.stopPropagation()}
        className={`max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl transition-opacity duration-150 ${
          imgVisible ? "opacity-100" : "opacity-0"
        }`}
      />

      <span className="mt-4 rounded-full bg-black/50 px-3 py-1 text-sm font-medium text-white">
        {index + 1} / {photos.length}
      </span>

      {photos.length > 1 && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="mt-3 flex max-w-[92vw] gap-2 overflow-x-auto px-2 pb-1"
        >
          {photos.map((p, i) => (
            <button
              key={p.url + i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Go to photo ${i + 1}`}
              aria-current={i === index}
              className={`h-[45px] w-[60px] shrink-0 overflow-hidden rounded-md border-2 transition ${
                i === index ? "border-accent" : "border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
