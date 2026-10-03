<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep the visual sandbox's sample listing and brochure content in route-local static data, because the designs must port without backend dependencies.
- Keep the popup and brochure as separate TanStack leaf routes, because each is an independently reviewable hand-port target.
- Keep the four product-flow pages as separate leaf routes with route-local mock records and shared presentation pieces, so each screen ports without backend data while visual patterns stay consistent.
