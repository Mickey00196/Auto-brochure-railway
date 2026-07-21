"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";
import type { ImportResult } from "@/lib/types";

export function ImportForm() {
  const [urlsText, setUrlsText] = useState("");
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const urls = urlsText
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length === 0) {
      setError("Paste at least one listing URL.");
      return;
    }
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const response = await api.importUrls(urls);
      setResults(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Listing URLs (one per line)</span>
            <textarea
              value={urlsText}
              onChange={(e) => setUrlsText(e.target.value)}
              rows={8}
              placeholder={"https://example-brokerage.test/listings/danzigerkade-13g\nhttps://example-brokerage.test/listings/moermanskkade-600"}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs"
            />
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? "Importing…" : "Import"}
          </Button>
        </form>
      </Card>

      {results && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Results</h2>
          <div className="space-y-3">
            {results.map((r) => (
              <div key={r.url} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate font-mono text-xs text-muted">{r.url}</span>
                  <Badge tone={r.status === "created" ? "success" : "danger"}>{r.status}</Badge>
                </div>
                {r.title && <p className="mt-1 font-medium">{r.title}</p>}
                {r.message && <p className="mt-1 text-xs text-amber-600">{r.message}</p>}
                {r.status === "created" && r.building_id && (
                  <Link href="/buildings" className="mt-1 inline-block text-xs text-accent hover:underline">
                    View in Buildings & Units →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
