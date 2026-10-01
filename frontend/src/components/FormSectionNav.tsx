"use client";

import { useEffect, useState } from "react";

export type FormSection = {
  id: string;
  label: string;
  /** Short status text, e.g. "14 captured" or "2 similar found". */
  meta?: string;
};

/** A sticky left-rail table of contents for a long, multi-card form —
 * desktop only (the cards still stack plainly on narrower screens, where a
 * sidebar would just eat width). Tracks which section is actually in view
 * via IntersectionObserver rather than just highlighting whatever's first,
 * so scrolling the page keeps the rail honest. */
export function FormSectionNav({ sections }: { sections: FormSection[] }) {
  const [activeId, setActiveId] = useState(sections[0]?.id);
  const activeIndex = Math.max(0, sections.findIndex((s) => s.id === activeId));

  // Re-run whenever the section list's identity changes (e.g. the lease-terms
  // card appears/disappears between new and edit mode) so the observer
  // always watches the cards actually on the page.
  const sectionIds = sections.map((s) => s.id).join(",");
  useEffect(() => {
    const targets = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry closest to the top of the viewport among those
        // currently intersecting — simple and avoids flicker between two
        // adjacent sections that are both partially visible.
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const top = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b));
        if (top.target.id) setActiveId(top.target.id);
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: [0, 1] },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-observe only when the id list itself changes
  }, [sectionIds]);

  // Guard against stale highlighting once a section that was active gets
  // removed from the DOM (new -> edit mode toggle never happens live today,
  // but this keeps the component correct if that changes).
  const activeStillExists = sections.some((s) => s.id === activeId);
  useEffect(() => {
    // Deferred a tick: a synchronous setState call in the effect body trips
    // react-hooks/set-state-in-effect (cascading-render risk).
    if (!activeStillExists && sections[0]) queueMicrotask(() => setActiveId(sections[0]!.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-check only when the section list changes
  }, [sectionIds]);

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Sections</p>
        <nav aria-label="Form sections" className="mt-3 space-y-1">
          {sections.map((s, i) => {
            const active = s.id === activeId;
            return (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={`flex items-baseline gap-2.5 rounded-lg px-3 py-2 text-xs transition-colors ${
                  active ? "bg-input-bg font-semibold text-foreground" : "font-medium text-muted hover:bg-input-bg/60 hover:text-foreground"
                }`}
              >
                <span className={`text-[10px] font-semibold ${active ? "text-accent" : "text-muted/60"}`}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex-1">{s.label}</span>
                {s.meta && <span className="text-[10px] text-muted/70">{s.meta}</span>}
              </a>
            );
          })}
        </nav>
        <div className="mt-6 border-t border-border pt-5">
          <div className="flex items-center justify-between text-[10px] font-medium text-muted">
            <span>Section</span>
            <span className="font-semibold text-foreground">
              {activeIndex + 1} / {sections.length}
            </span>
          </div>
          <div className="mt-2 h-1 rounded-full bg-input-bg">
            <div
              className="h-1 rounded-full bg-accent transition-all"
              style={{ width: `${((activeIndex + 1) / sections.length) * 100}%` }}
            />
          </div>
          <p className="mt-5 text-[11px] leading-relaxed text-muted">
            Duplicates are checked automatically as the address is typed.
          </p>
        </div>
      </div>
    </aside>
  );
}
