"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Building2, Loader2, LogIn } from "lucide-react";

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "Login failed" }));
        setError(body.message ?? "That email and password don’t match.");
        return;
      }
      // A hard navigation, not router.push(): the client-side Router Cache
      // may have already cached a redirect-to-/login response for the
      // target route from before this cookie existed, and router.push()
      // can replay that stale cache instead of re-checking proxy.ts.
      window.location.href = searchParams.get("next") || "/";
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2.5 text-sm font-semibold text-dark">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-dark text-white">
            <Building2 size={17} />
          </span>
          Office Shortlist
        </div>
        <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-surface p-7 shadow-sm">
          <h1 className="text-xl font-semibold">Log in</h1>
          <p className="mt-1 text-sm text-muted">Welcome back. Sign in to your account.</p>

          <label htmlFor="email" className="mt-6 block text-xs font-semibold">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
          />

          <label htmlFor="password" className="mt-4 block text-xs font-semibold">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
          />

          {error && (
            <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-dark text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
            Log in
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          No account yet?{" "}
          <Link href="/signup" className="text-accent hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
