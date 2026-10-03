"use client";

import { useEffect } from "react";

/** Warns on tab close/refresh/external navigation while a form has unsaved
 * changes — the standard `beforeunload` confirm. This can NOT catch an
 * in-app Link click or router.push() (the App Router has no navigation-guard
 * API), so it only covers the browser-level exits; losing work via a nav-bar
 * click while a long form is dirty is a separate, harder problem. Still
 * closes the worst case: a refresh or closed tab silently discarding a
 * long capture. */
export function useUnsavedChangesWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      // Chrome requires returnValue to be set; the string itself is ignored
      // by every modern browser in favor of a fixed, generic prompt.
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}
