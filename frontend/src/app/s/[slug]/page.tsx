import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { PublicClient } from "@/lib/types";
import { INTERNAL_API_BASE_URL } from "@/lib/serverApi";
import { BrochureView } from "@/components/BrochureView";

/** A client's shareable live link — the one page in this app a visitor with
 * no account can open (see proxy.ts and NavBar.tsx). Fetched straight from
 * the backend's unauthenticated /public/clients/{slug}, never through
 * serverApi (every other call there assumes a logged-in broker). Laid out
 * to match the approved Lovable brochure design 1:1 — see
 * src/routes/shortlist/$slug.tsx in the design sandbox — with real captured
 * photos and data standing in for its placeholder blocks. The interactive
 * parts (map, lightbox, print) live in BrochureView, a client component. */
async function getPublicClient(slug: string): Promise<PublicClient | null> {
  try {
    const res = await fetch(`${INTERNAL_API_BASE_URL}/public/clients/${slug}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as PublicClient;
  } catch {
    return null;
  }
}

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
