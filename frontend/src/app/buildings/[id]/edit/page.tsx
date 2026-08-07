import { redirect } from "next/navigation";

/** The building page is the edit screen now — keep this old route working
 * for anything already linking or bookmarked to it. */
export default async function LegacyEditRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/buildings/${id}`);
}
