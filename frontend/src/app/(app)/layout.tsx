import { NavBar } from "@/components/NavBar";
import { serverApi } from "@/lib/serverApi";

/** Chrome for every broker-facing page: nav bar + the centred max-width
 * column. The public client brochure (/s/[slug]) deliberately sits outside
 * this group so it isn't boxed in by it. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // /login itself has no session cookie yet, so this legitimately fails
  // there — proxy.ts is what actually gates access, this is just for the
  // nav bar's "signed in as" display.
  const user = await serverApi.me().catch(() => null);

  return (
    <>
      <NavBar user={user} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>
    </>
  );
}
