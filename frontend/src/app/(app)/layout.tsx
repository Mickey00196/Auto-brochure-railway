import { Sidebar, type SidebarClient } from "@/components/Sidebar";
import { serverApi } from "@/lib/serverApi";

/** Chrome for every signed-in broker page: the sidebar plus a centred content
 * column. The public client brochure (/s/[slug]) and the login/signup pages
 * ((auth) group) sit outside this group, so they get neither. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Both are only for the sidebar (name, client count, live links): a slow
  // backend costs an emptier sidebar, never a blank page — same 1.5s cap the
  // capture form uses. proxy.ts is what actually gates access.
  const [user, clients] = await Promise.all([
    serverApi.me().catch(() => null),
    Promise.race([
      serverApi.clients().catch(() => []),
      new Promise<never[]>((resolve) => setTimeout(() => resolve([]), 1500)),
    ]),
  ]);
  const sidebarClients: SidebarClient[] = clients.map((c) => ({
    client_id: c.client_id,
    display_name: c.display_name,
    is_live: c.is_live,
  }));

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <Sidebar user={user} clients={sidebarClients} />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-8 lg:px-12 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
