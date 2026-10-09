import { PageHeader } from "@/components/ui";
import { ImportForm } from "@/components/ImportForm";
import { IngestionPanel } from "@/components/IngestionPanel";
import { ListingBookmarklet } from "@/components/ListingBookmarklet";

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5 mt-14">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted">{description}</p>
    </div>
  );
}

export default function ImportPage() {
  return (
    <div>
      <PageHeader
        title="Import"
        description="Bring listings into your library in bulk. Sources that don't allow automated access are skipped and shown as unavailable."
        showHomeLink={false}
      />
      <IngestionPanel />

      <div id="bookmarklet" className="scroll-mt-10">
        <SectionTitle
          title="Bookmarklet"
          description="For a listing you're viewing in your own browser — a no-install alternative to the Chrome extension, useful when IT has disabled developer mode."
        />
        <ListingBookmarklet />
      </div>

      <SectionTitle
        title="Import specific links"
        description="Paste one or more listing links. Each is fetched, read and saved as a building in your library."
      />
      <ImportForm />
    </div>
  );
}
