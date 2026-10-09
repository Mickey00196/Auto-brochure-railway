"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@/components/ui";

const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null = still probing; keep the form visible meanwhile (fail open).
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/signup")
      .then((r) => r.json())
      .then((b: { enabled?: boolean }) => setEnabled(b.enabled !== false))
      .catch(() => setEnabled(true));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "Signup failed" }));
        setError(body.message ?? "Signup failed");
        return;
      }
      // A hard navigation, not router.push() — see login/page.tsx for why.
      window.location.href = "/";
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <div className="mb-8 text-center">
        <div className="text-xs font-bold uppercase tracking-wide text-accent">Office Shortlist</div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Create an account</h1>
        <p className="mt-2 text-sm text-muted">
          Every account can see and edit everything in this workspace — only use this on a
          deployment you control.
        </p>
      </div>
      {enabled === false ? (
        <Card>
          <p className="text-sm">
            Account creation is disabled on this deployment — accounts are provisioned by whoever
            runs it. Ask your administrator for login details, then{" "}
            <Link href="/login" className="text-accent hover:underline">
              sign in
            </Link>
            .
          </p>
        </Card>
      ) : (
      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm">Name</label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-sm">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-sm">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Creating account…" : "Create account"}
          </Button>
        </form>
      </Card>
      )}
      <p className="mt-4 text-center text-sm text-muted">
        Already have an account? <Link href="/login" className="text-accent hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
