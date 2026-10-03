"use client";

import { useRouter } from "next/navigation";

/** Browser-style back/forward, but always reachable from inside the app —
 * useful in embedded/kiosk-style windows where the browser's own chrome
 * (and its back/forward buttons) isn't visible. Just wraps the History API
 * via the router, so it stays in sync with whatever the browser itself
 * would do. There's no reliable way to know if there's anything to go back
 * or forward to (the History API doesn't expose that), so both stay
 * enabled — clicking past the end of the stack is a harmless no-op, same as
 * the browser's own buttons in that state. */
export function NavHistoryButtons() {
  const router = useRouter();

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => router.back()}
        aria-label="Go back"
        title="Back"
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-border/40 hover:text-foreground"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => router.forward()}
        aria-label="Go forward"
        title="Forward"
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-border/40 hover:text-foreground"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M6 3 11 8l-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
