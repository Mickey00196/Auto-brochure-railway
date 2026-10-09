import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import "@fontsource/instrument-serif/latin-400.css";
import type { PublicClient } from "@/lib/types";
import { internalApiBaseUrl } from "@/lib/internalApiBaseUrl";
import { BrochureView } from "@/components/BrochureView";

const INTERNAL_API_BASE_URL = internalApiBaseUrl();

/** A client's shareable live link — the one page in this app a visitor with
 * no account can open (see proxy.ts). It sits outside the (app) route group,
 * so it gets no broker nav and isn't boxed into the app's max-width column.
 * Fetched straight from the backend's unauthenticated /public/clients/{slug},
 * never through serverApi (every other call there assumes a logged-in
 * broker). The interactive parts (map, lightbox, print) live in
 * BrochureView, a client component.
 *
 * cache(): generateMetadata and the page both need the client — one backend
 * call per request instead of two. */
const getPublicClient = cache(async (slug: string): Promise<PublicClient | null> => {
  try {
    const res = await fetch(`${INTERNAL_API_BASE_URL}/public/clients/${encodeURIComponent(slug)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as PublicClient;
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const client = await getPublicClient(slug);
  const name = client?.display_name ?? "Client";
  const count = client?.buildings.length ?? 0;
  const description = `${count} office building${count === 1 ? "" : "s"} on this shortlist, shared by your broker.`;
  const image = client?.buildings.find((b) => b.photos.length > 0)?.photos[0];
  return {
    title: `${name} – Office shortlist`,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title: `${name} – Office shortlist`,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function PublicClientPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const client = await getPublicClient(slug);
  if (!client) notFound();
  return <BrochureView client={client} />;
}
