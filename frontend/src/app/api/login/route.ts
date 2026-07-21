import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { internalApiBaseUrl } from "@/lib/internalApiBaseUrl";

const INTERNAL_API_BASE_URL = internalApiBaseUrl();
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // matches the backend's 7-day JWT expiry

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return NextResponse.json({ message: "Email and password are required" }, { status: 400 });
  }

  const res = await fetch(`${INTERNAL_API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: body.email, password: body.password }),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: "Login failed" }));
    return NextResponse.json({ message: detail.detail ?? "Incorrect email or password" }, { status: res.status });
  }

  const { access_token, user } = await res.json();

  // NODE_ENV isn't a reliable signal here: `next start` always sets it to
  // "production" even when testing a production build locally over plain
  // HTTP, and a Secure cookie set over HTTP is silently dropped by the
  // browser — every request after login would then look logged-out. Derive
  // it from the actual connection instead, including the case where a PaaS
  // load balancer terminates TLS in front of the app (x-forwarded-proto).
  const isHttps =
    request.headers.get("x-forwarded-proto") === "https" || new URL(request.url).protocol === "https:";

  (await cookies()).set({
    name: "session",
    value: access_token,
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });

  return NextResponse.json({ user });
}
