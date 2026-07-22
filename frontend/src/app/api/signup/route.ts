import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { internalApiBaseUrl } from "@/lib/internalApiBaseUrl";

const INTERNAL_API_BASE_URL = internalApiBaseUrl();
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // matches the backend's 7-day JWT expiry
// A misconfigured/unreachable INTERNAL_API_BASE_URL would otherwise hang the
// signup request indefinitely instead of surfacing a clear error.
const BACKEND_TIMEOUT_MS = 10_000;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return NextResponse.json({ message: "Email and password are required" }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(`${INTERNAL_API_BASE_URL}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: body.email, name: body.name, password: body.password }),
      cache: "no-store",
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { message: `Could not reach backend at ${INTERNAL_API_BASE_URL}: ${reason}` },
      { status: 502 },
    );
  }

  if (res.status === 404) {
    return NextResponse.json({ message: "Signup is not enabled on this deployment" }, { status: 404 });
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: "Signup failed" }));
    return NextResponse.json({ message: detail.detail ?? "Signup failed" }, { status: res.status });
  }

  const { access_token, user } = await res.json();

  // See src/app/api/login/route.ts for why isHttps is derived this way
  // rather than from NODE_ENV.
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
