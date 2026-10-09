"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Loader2 } from "lucide-react";

const inputClass =
  "mt-2 h-12 w-full rounded-xl border border-border bg-surface px-3.5 text-[15px] text-foreground placeholder:text-placeholder transition focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10";

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
    <div className="w-full max-w-[380px]">
      <div className="mb-10 flex items-center gap-2.5 text-[15px] font-semibold tracking-tight lg:hidden">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-dark text-white">
          <Building2 size={17} aria-hidden="true" />
        </span>
        Office Shortlist
      </div>
      <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.03em]">Create an account</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">
        Every account can see and edit everything in this workspace.
      </p>

      {enabled === false ? (
        <p className="mt-8 rounded-2xl bg-surface p-5 text-sm leading-relaxed shadow-card">
          Account creation is turned off here. Ask whoever runs Office Shortlist for login details, then{" "}
          <Link href="/login" className="font-medium text-accent hover:underline">
            sign in
          </Link>
          .
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8">
          <label htmlFor="name" className="block text-sm font-medium">
            Name
          </label>
          <input id="name" type="text" required autoFocus autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          <label htmlFor="email" className="mt-5 block text-sm font-medium">
            Email
          </label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          <label htmlFor="password" className="mt-5 block text-sm font-medium">
            Password
          </label>
          <input id="password" type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          {error && (
            <p role="alert" className="mt-5 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-dark text-sm font-semibold text-white transition-colors hover:bg-dark/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>
      )}
      <p className="mt-6 text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
