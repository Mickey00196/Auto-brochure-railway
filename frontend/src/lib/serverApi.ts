import "server-only";

import { cookies } from "next/headers";
import { makeApi } from "./apiCore";
import { internalApiBaseUrl } from "./internalApiBaseUrl";

/** Server Components run in a trusted environment, so it's fine for them to
 * read the session cookie directly and call the FastAPI backend server-to-
 * server (no CORS involved). Only import this from page.tsx-style Server
 * Components — never from a "use client" file, or Next.js will try to bundle
 * next/headers for the browser and fail the build. Client components use
 * api.ts (the same-origin proxy) instead.
 *
 * Deliberately does NOT call redirect() on a 401 here: Next.js requires
 * redirect() to be called outside any try/catch (it works by throwing), and
 * every page in this app wraps its data fetch in try/catch or .catch() for
 * its own "backend unreachable" messaging — a redirect thrown from inside
 * this shared helper would just get swallowed by those. The "logged out /
 * expired token" gate lives in proxy.ts instead, which runs before any page
 * renders and checks the JWT's exp claim, not just cookie presence. A 401
 * that reaches this far (e.g. a tampered cookie) surfaces as a normal error
 * via each page's existing fallback. */
export const INTERNAL_API_BASE_URL = internalApiBaseUrl();

// A misconfigured/unreachable INTERNAL_API_BASE_URL (wrong internal
// hostname, backend mid-restart) would otherwise hang each request
// indefinitely rather than failing fast with the "Could not reach the API"
// message every page already renders for this case.
const BACKEND_TIMEOUT_MS = 10_000;

async function serverRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = (await cookies()).get("session")?.value;
  let res: Response;
  try {
    res = await fetch(`${INTERNAL_API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new Error(`${init?.method ?? "GET"} ${path} failed: could not reach backend at ${INTERNAL_API_BASE_URL} (${reason})`);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${init?.method ?? "GET"} ${path} failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<T>;
}

export const serverApi = makeApi(serverRequest);
