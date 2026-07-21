import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { internalApiBaseUrl } from "@/lib/internalApiBaseUrl";

/** Every browser-side call in this app (src/lib/api.ts) goes through here
 * instead of hitting the FastAPI backend directly. That keeps the session
 * JWT in an httpOnly cookie the whole time — it's read here, server-side,
 * and never exposed to client JS (so an XSS bug can't read it out of
 * localStorage/document.cookie the way a Bearer-token-in-the-browser
 * approach would risk). Server Components skip this and call the backend
 * directly instead — see src/lib/serverApi.ts. */
const INTERNAL_API_BASE_URL = internalApiBaseUrl();

async function forward(request: Request, path: string[], search: string): Promise<Response> {
  const token = (await cookies()).get("session")?.value;
  if (!token) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  const targetUrl = `${INTERNAL_API_BASE_URL}/${path.join("/")}${search}`;
  const hasBody = !["GET", "HEAD"].includes(request.method);

  const res = await fetch(targetUrl, {
    method: request.method,
    headers: {
      "Content-Type": request.headers.get("content-type") ?? "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: hasBody ? await request.arrayBuffer() : undefined,
    cache: "no-store",
  });

  const responseHeaders = new Headers();
  const contentType = res.headers.get("content-type");
  const contentDisposition = res.headers.get("content-disposition");
  if (contentType) responseHeaders.set("content-type", contentType);
  if (contentDisposition) responseHeaders.set("content-disposition", contentDisposition);

  return new Response(res.body, { status: res.status, headers: responseHeaders });
}

async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const search = new URL(request.url).search;
  return forward(request, path, search);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
