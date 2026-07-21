import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** The one auth gate for the whole app: no valid, unexpired session cookie
 * means no page render — redirect to /login before anything else runs.
 * (Checks the JWT's exp claim only, no signature verification — the actual
 * security boundary is the backend rejecting an invalid/tampered token on
 * every request; this is just to avoid rendering broken pages for a user
 * whose 7-day session has quietly expired.) */
function isTokenLikelyValid(token: string | undefined): boolean {
  if (!token) return false;
  const payloadSegment = token.split(".")[1];
  if (!payloadSegment) return false;
  try {
    const payload = JSON.parse(atob(payloadSegment.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

const PUBLIC_PATHS = new Set(["/login", "/api/login"]);

export function proxy(request: NextRequest) {
  const token = request.cookies.get("session")?.value;
  const isLoggedIn = isTokenLikelyValid(token);
  const pathname = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.has(pathname);

  if (!isLoggedIn && !isPublicPath) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except static assets, image optimization, and favicon —
    // including /api/proxy/* (needs the same "must be logged in" gate as
    // page navigation) and /api/login (exempted above via PUBLIC_PATHS,
    // since it's the one route a logged-out visitor needs to reach).
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
