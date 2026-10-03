"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { IngestionJob, SourceHealth } from "@/lib/types";
import { api } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";

const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

const HEALTH_TONE: Record<SourceHealth["status"], "success" | "warn" | "danger" | "default"> = {
  healthy: "success",
  degraded: "warn",
  unavailable: "danger",
  unknown: "default",
};

const HEALTH_LABEL: Record<SourceHealth["status"], string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  unavailable: "Temporarily unavailable",
  unknown: "Not yet run",
};

export function IngestionPanel() {
  const [sources, setSources] = useState<SourceHealth[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ city: "Amsterdam", propertyType: "office", minArea: "500", maxArea: "5000" });
  const [job, setJob] = useState<IngestionJob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadSources = useCallback(async () => {
    try {
      const s = await api.sourceHealth();
      setSources(s);
      // Default-select the sources that can actually search (not the generic helper).
      setSelected((prev) =>
        prev.size ? prev : new Set(s.filter((x) => x.source !== "generic").map((x) => x.source)),
      );
    } catch {
      /* health is best-effort; the form still works */
    }
  }, []);

  useEffect(() => {
    // Async fetch — state is set after the await, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSources();
  }, [loadSources]);

  // Poll the running job until it reaches a terminal state.
  useEffect(() => {
    if (!job || job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const updated = await api.ingestionJob(job.job_id);
        setJob(updated);
        if (updated.status === "completed" || updated.status === "failed") loadSources();
      } catch {
        /* transient poll failure — try again next tick */
      }
    }, 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [job, loadSources]);

  function toggle(source: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  }

  async function start() {
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.startIngestion({
        city: form.city || null,
        property_type: form.propertyType,
        min_area_sqm: form.minArea ? Number(form.minArea) : null,
        max_area_sqm: form.maxArea ? Number(form.maxArea) : null,
        sources: selected.size ? [...selected] : null,
        max_results: 100,
      });
      setJob(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start ingestion");
    } finally {
      setSubmitting(false);
    }
  }

  const running = job && (job.status === "queued" || job.status === "running");

  return (
    <Card className="mb-8">
      <h2 className="mb-1 text-lg font-semibold">Import Market Data</h2>
      <p className="mb-4 text-sm text-muted">
        Enter search criteria and the backend ingests matching office listings from the selected
        sources — discover, parse, normalize, deduplicate, and store. A source that blocks or hasn&apos;t
        published an automated access route is skipped and shown as unavailable; the rest still run.
      </p>

      <div className="grid gap-4 sm:grid-cols-4">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Location</span>
          <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} className={inputClass} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Type</span>
          <input value={form.propertyType} onChange={(e) => setForm((f) => ({ ...f, propertyType: e.target.value }))} className={inputClass} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Min m²</span>
          <input type="number" value={form.minArea} onChange={(e) => setForm((f) => ({ ...f, minArea: e.target.value }))} className={inputClass} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Max m²</span>
          <input type="number" value={form.maxArea} onChange={(e) => setForm((f) => ({ ...f, maxArea: e.target.value }))} className={inputClass} />
        </label>
      </div>

      <div className="mt-4">
        <span className="mb-2 block text-sm font-medium">Sources</span>
        <div className="flex flex-wrap gap-3">
          {sources.map((s) => (
            <label key={s.source} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={selected.has(s.source)}
                disabled={s.source === "generic"}
                onChange={() => toggle(s.source)}
              />
              <span>{s.display_name ?? s.source}</span>
              <Badge tone={HEALTH_TONE[s.status]}>{HEALTH_LABEL[s.status]}</Badge>
            </label>
          ))}
          {sources.length === 0 && <span className="text-sm text-muted">Loading sources…</span>}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

      <div className="mt-5">
        <Button onClick={start} disabled={submitting || !!running || selected.size === 0}>
          {running ? "Import running…" : submitting ? "Starting…" : "Start Import"}
        </Button>
      </div>

      {job && <JobProgress job={job} />}
    </Card>
  );
}

function JobProgress({ job }: { job: IngestionJob }) {
  const pct = job.progress_total ? Math.round((job.progress_current / job.progress_total) * 100) : 0;
  return (
    <div className="mt-6 border-t border-border pt-5">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium capitalize">{job.status}</span>
        <span className="text-muted">
          {job.progress_current} / {job.progress_total || "?"} listings processed
        </span>
      </div>
      <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-border">
        <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Discovered" value={job.discovered} />
        <Stat label="Created" value={job.created} />
        <Stat label="Updated" value={job.updated} />
        <Stat label="Unchanged" value={job.unchanged} />
        <Stat label="Errors" value={job.failed} tone={job.failed ? "warn" : "default"} />
      </div>

      {job.error && <p className="mt-3 text-sm text-red-500">{job.error}</p>}

      {job.logs.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-muted">Log ({job.logs.length} lines)</summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-background p-3 text-xs text-muted">
            {job.logs.map((l) => `[${l.level.toUpperCase()}] ${l.msg}`).join("\n")}
          </pre>
        </details>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "warn" }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={`text-2xl font-bold ${tone === "warn" ? "text-amber-500" : ""}`}>{value}</div>
    </div>
  );
}
