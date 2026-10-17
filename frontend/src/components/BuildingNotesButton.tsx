"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, MessageSquareText } from "lucide-react";
import type { Building } from "@/lib/types";
import { api } from "@/lib/api";
import { Button, fieldInputClass, fieldLabelClass } from "@/components/ui";

/** "Your advice" on a building in a client folder: why it made this
 * client's shortlist and what to keep in mind. The client reads it on the
 * live link, above the listing's own description — it's the part a Funda
 * link can't give them. */
export function BuildingNotesButton({
  building,
  clientName,
  onSaved,
}: {
  building: Building;
  clientName: string;
  onSaved: (next: Building) => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(building.broker_note ?? "");
  const [watchOut, setWatchOut] = useState(building.watch_out ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasAdvice = Boolean(building.broker_note || building.watch_out);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy]);

  function start() {
    setNote(building.broker_note ?? "");
    setWatchOut(building.watch_out ?? "");
    setError(null);
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const next = await api.updateBuildingNotes(building.building_id, { broker_note: note, watch_out: watchOut });
      onSaved({ ...building, broker_note: next.broker_note ?? null, watch_out: next.watch_out ?? null });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        className={`inline-flex items-center gap-1.5 font-medium hover:underline ${hasAdvice ? "text-success-foreground" : "text-accent"}`}
      >
        <MessageSquareText size={13} aria-hidden="true" />
        {hasAdvice ? "Edit your advice" : "Add your advice"}
      </button>

      {/* Portalled to <body>: the card this sits in lifts on hover with a
          transform, which would otherwise make the "fixed" overlay fill
          only the card. */}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(15_27_51/0.45)] p-4 backdrop-blur-[2px]"
            onClick={() => !busy && setOpen(false)}
            role="presentation"
          >
            <form
              role="dialog"
              aria-modal="true"
              aria-labelledby={`notes-${building.building_id}`}
              onClick={(e) => e.stopPropagation()}
              onSubmit={save}
              className="w-full max-w-lg rounded-[20px] bg-surface p-6 text-left text-foreground shadow-float"
            >
              <h2 id={`notes-${building.building_id}`} className="text-lg font-semibold tracking-tight">
                Your advice on {building.address || building.name}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                {clientName} reads this on their live link, above the listing text. A few lines is plenty.
              </p>
              <label className="mt-5 flex flex-col gap-1.5">
                <span className={fieldLabelClass}>Why it&apos;s on the shortlist</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  autoFocus
                  placeholder="E.g. Fits your 1,300 m² on one floor, five minutes' walk from Centraal, and the landlord is open to a fit-out contribution."
                  className={`${fieldInputClass} resize-y`}
                />
              </label>
              <label className="mt-4 flex flex-col gap-1.5">
                <span className={fieldLabelClass}>Points to consider</span>
                <textarea
                  value={watchOut}
                  onChange={(e) => setWatchOut(e.target.value)}
                  rows={3}
                  placeholder="E.g. Rent on request; parking is tight at 1 space per 130 m²."
                  className={`${fieldInputClass} resize-y`}
                />
              </label>
              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
              <div className="mt-6 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                  Save
                </Button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}
