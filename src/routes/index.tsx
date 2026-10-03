import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => { throw redirect({ to: "/popup" }); },
  head: () => ({ meta: [
    { title: "Office Shortlist — Design Sandbox" },
    { name: "description", content: "Visual concepts for Office Shortlist's listing capture and online brochure." },
    { property: "og:title", content: "Office Shortlist — Design Sandbox" },
    { property: "og:description", content: "Visual concepts for listing capture and online brochures." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});
