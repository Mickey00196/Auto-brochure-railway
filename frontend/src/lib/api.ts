"use client";

import { makeApi } from "./apiCore";

/** Browser-side calls never talk to the FastAPI backend directly — they hit
 * this same-origin proxy (src/app/api/proxy/[...path]/route.ts), which reads
 * the httpOnly session cookie server-side and attaches the bearer token.
 * The token itself never reaches client JS, which keeps it out of reach of
 * an XSS bug reading localStorage/document.cookie. */
async function clientRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/proxy${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Not authenticated");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${init?.method ?? "GET"} ${path} failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = makeApi(clientRequest);

/** For client components that need the raw proxy URL — file downloads
 * (ExportPanel) that read the response as a blob instead of JSON. */
export const PROXY_BASE_URL = "/api/proxy";
