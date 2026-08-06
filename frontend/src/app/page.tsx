import { redirect } from "next/navigation";

/** The library is the tool's home screen — capture, select, generate all
 * start from there, so "/" goes straight to it rather than to a separate
 * dashboard the workflow doesn't need. */
export default function HomePage() {
  redirect("/buildings");
}
