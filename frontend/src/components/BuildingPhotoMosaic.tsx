"use client";

import { useState } from "react";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { PhotoPlaceholder } from "@/components/ui";

/** Corner rounding for thumbnail i of n, so the mosaic reads as one rounded block. */
function thumbShape(n: number, i: number): string {
  if (n === 1) return "rounded-md rounded-r-[20px]";
  if (n === 2) return i === 0 ? "rounded-md rounded-tr-[20px]" : "rounded-md rounded-br-[20px]";
  if (n === 3) return ["rounded-md", "rounded-md rounded-tr-[20px]", "rounded-md rounded-br-[20px]"][i];
  return ["rounded-md", "rounded-md rounded-tr-[20px]", "rounded-md", "rounded-md rounded-br-[20px]"][i];
}

/** The building page's photo header: one large photo with up to four beside
 * it, the last one carrying "+N more". Any photo opens the lightbox. */
export function BuildingPhotoMosaic({ photos }: { photos: string[] }) {
  const [viewer, setViewer] = useState<number | null>(null);

  if (photos.length === 0) {
    return (
      <div className="relative h-[260px] overflow-hidden rounded-[20px] sm:h-[300px]">
        <PhotoPlaceholder className="h-full w-full" />
        <span className="absolute inset-x-0 bottom-5 text-center text-sm text-muted">No photos yet. Edit the building to add some.</span>
      </div>
    );
  }

  const thumbs = photos.slice(1, 5);
  const extra = photos.length - 1 - thumbs.length;
  // 1 photo: full width. 2–3: big + a column. 4+: big + a 2×2 grid.
  const cols = thumbs.length === 0 ? "sm:grid-cols-1" : thumbs.length < 3 ? "sm:grid-cols-[2fr_1fr]" : "sm:grid-cols-[2fr_1fr_1fr]";
  const big = thumbs.length === 0 ? "rounded-[20px]" : "rounded-[20px] sm:rounded-l-[20px] sm:rounded-r-md";

  return (
    <section aria-label="Photos" className="relative">
      <PhotoLightbox
        photos={photos.map((url) => ({ url }))}
        initialIndex={viewer ?? 0}
        open={viewer !== null}
        onClose={() => setViewer(null)}
      />
      <div className={`grid h-[260px] grid-cols-1 grid-rows-2 gap-2 sm:h-[428px] ${cols}`}>
        <button
          type="button"
          onClick={() => setViewer(0)}
          className={`group relative row-span-2 overflow-hidden bg-input-bg ${big}`}
          aria-label="Open photo 1"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary captured URLs, no fixed domain to allowlist */}
          <img src={photos[0]} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
        </button>
        {thumbs.map((src, i) => {
          const last = i === thumbs.length - 1;
          const shape = thumbShape(thumbs.length, i);
          return (
            <button
              key={src}
              type="button"
              onClick={() => setViewer(i + 1)}
              aria-label={last && extra > 0 ? `Open photo ${i + 2}, ${extra} more after it` : `Open photo ${i + 2}`}
              className={`group relative hidden overflow-hidden bg-input-bg sm:block ${shape} ${
                thumbs.length === 1 ? "row-span-2" : thumbs.length === 3 && i === 2 ? "col-span-2" : ""
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary captured URLs */}
              <img src={src} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
              {last && extra > 0 && (
                <span className="absolute inset-0 flex items-center justify-center bg-dark/55 text-[15px] font-semibold text-white">
                  +{extra} more
                </span>
              )}
            </button>
          );
        })}
      </div>
      {photos.length > 1 && (
        <button
          type="button"
          onClick={() => setViewer(0)}
          className="absolute bottom-4 left-4 h-9 rounded-full bg-white px-3.5 text-[13px] font-medium text-[#0F1B33] shadow-[0_6px_18px_-10px_rgba(15,27,51,0.5)] transition hover:bg-white/90"
        >
          View all {photos.length} photos
        </button>
      )}
    </section>
  );
}
