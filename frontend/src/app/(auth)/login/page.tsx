"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Building2, Loader2 } from "lucide-react";

/** Only ever send someone back to a page on this site after login. A raw
 * `?next=` value is attacker-controlled: "https://evil.example" or
 * "//evil.example" would otherwise bounce a freshly signed-in colleague to a
 * look-alike page. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

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
      window.location.href = safeNext(searchParams.get("next"));
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
      <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.03em]">Sign in</h1>
      <p className="mt-2 text-[15px] text-muted">Use the email and password you were given.</p>

      <form onSubmit={handleSubmit} className="mt-8">
        <label htmlFor="email" className="block text-sm font-medium">
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
          className="mt-2 h-12 w-full rounded-xl border border-border bg-surface px-3.5 text-[15px] text-foreground placeholder:text-placeholder transition focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10"
        />

        <label htmlFor="password" className="mt-5 block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-2 h-12 w-full rounded-xl border border-border bg-surface px-3.5 text-[15px] text-foreground placeholder:text-placeholder transition focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10"
        />

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
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-6 text-sm text-muted">
        No account yet?{" "}
        <Link href="/signup" className="font-medium text-accent hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
