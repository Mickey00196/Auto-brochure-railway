"use client";

import { useEffect, useRef, useState } from "react";
import { fieldInputClass } from "@/components/ui";

// No canonical amenities list exists in the backend (checked models/schemas/
// seed data) — this is a suggestion list only, not an enum. Any value the
// broker types is accepted; unmatched buildings.building_amenities /
// units.unit_amenities entries from before this component existed just show
// up as an already-selected tag the first time the record is opened.
export const SUGGESTED_AMENITIES = [
  "Restaurant",
  "Bar",
  "Supermarket",
  "Parking",
  "Meeting rooms",
  "Lifts",
  "Reception",
  "Bike storage",
  "Gym",
  "Terrace",
  "Canteen",
  "Roof terrace",
  "EV charging",
  "Air conditioning",
  "Security / access control",
  "Loading dock",
  "Server room",
  "Showers",
  "Lounge area",
  "Conference center",
];

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export function AmenityMultiSelect({
  value,
  onChange,
  suggestions = SUGGESTED_AMENITIES,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function add(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!value.some((v) => norm(v) === norm(trimmed))) onChange([...value, trimmed]);
    setQuery("");
    searchRef.current?.focus();
  }

  function remove(name: string) {
    onChange(value.filter((v) => v !== name));
  }

  const q = norm(query);
  const candidates = suggestions.filter((s) => !value.some((v) => norm(v) === norm(s)) && norm(s).includes(q));
  const exactExists = suggestions.concat(value).some((s) => norm(s) === q);

  return (
    <div ref={wrapRef} className="flex flex-wrap items-center gap-2.5">
      {value.map((name) => (
        <span
          key={name}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-sm text-foreground"
        >
          {name}
          <button
            type="button"
            onClick={() => remove(name)}
            aria-label={`Remove ${name}`}
            className="leading-none text-muted opacity-70 hover:opacity-100"
          >
            ×
          </button>
        </span>
      ))}

      <div className="relative inline-block">
        <button
          type="button"
          onClick={() => {
            setOpen((o) => !o);
            setQuery("");
            if (!open) setTimeout(() => searchRef.current?.focus(), 0);
          }}
          className="rounded-full border border-dashed border-muted px-3.5 py-1.5 text-sm font-semibold text-muted hover:border-accent hover:text-accent"
        >
          + Add amenity
        </button>

        {open && (
          <div className="absolute left-0 top-[calc(100%+8px)] z-40 w-60 rounded-xl border border-border bg-surface p-2 shadow-lg">
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (query.trim()) add(query);
                } else if (e.key === "Escape") {
                  setOpen(false);
                }
              }}
              placeholder="Search or type your own…"
              autoComplete="off"
              className={`${fieldInputClass} mb-1.5 px-2.5 py-2 text-[13px]`}
            />
            <div className="max-h-[190px] overflow-y-auto">
              {q && !exactExists && (
                <button
                  type="button"
                  onClick={() => add(query)}
                  className="block w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] font-semibold text-accent hover:bg-input-bg"
                >
                  {`+ Add "${query.trim()}"`}
                </button>
              )}
              {candidates.length === 0 && (!q || exactExists) && (
                <p className="px-2.5 py-1.5 text-xs text-muted">
                  {q ? "Already added" : "Start typing to add a custom amenity"}
                </p>
              )}
              {candidates.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => add(name)}
                  className="block w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] text-foreground hover:bg-input-bg"
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
