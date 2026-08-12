# UX Audit — Office Shortlist / Real Estate Brochure Engine

Scope: a full walkthrough of the deployed app as a broker would actually use it — capture,
library, clients, PDF generation — plus a route-by-route map and cross-cutting checks. No code
was changed for this audit. Everything below reflects the app as of `main` at the time of writing.

---

## 1. Flow map

Every page under `frontend/src/app`, how you arrive, and where you can go.

```
                                   ┌────────────┐
                                   │   /login   │◄── proxy.ts redirects here
                                   │  (public)  │    for any unauthenticated request
                                   └─────┬──────┘
                                         │ "Create one"
                                         ▼
                                   ┌────────────┐
                                   │  /signup   │  (public; disabled banner if
                                   │  (public)  │   admin turned off signups)
                                   └────────────┘

  On successful login → redirected to "next" query param, or "/"

┌──────────────────────────────────────────────────────────────────────────┐
│  /  (home)                                                                │
│  3 pillar cards:                                                          │
│   ┌─────────────────┐   ┌─────────────────────┐   ┌───────────────────┐  │
│   │ Building library│   │ Import market data   │   │ Clients           │  │
│   └────────┬────────┘   └──────────┬───────────┘   └─────────┬─────────┘  │
└────────────┼────────────────────────┼───────────────────────┼────────────┘
             │                        │                        │
             ▼                        ▼                        ▼
      ┌─────────────┐          ┌────────────┐           ┌─────────────┐
      │  /buildings │          │  /import   │           │  /clients   │
      └──────┬──────┘          └─────┬──────┘           └──────┬──────┘
             │                       │ (no sub-routes —          │
             │                       │  IngestionPanel,          │ "+ New client"
             │                       │  ListingBookmarklet,      ▼
             │                       │  ImportForm all inline) ┌─────────────┐
             │                                                 │/clients/new │
             │                                                 └──────┬──────┘
             │ "+ Add building" / click a card                        │ submit
             ▼                                                        ▼
      ┌───────────────┐                                        ┌──────────────┐
      │/buildings/new │──submit──► /buildings?select=<id> ◄─────┤/clients/[id] │
      └───────────────┘            (back to library, new         │ (folder)     │
             ▲                      building pre-ticked)         └──────┬───────┘
             │                                                          │
   Chrome extension / bookmarklet                              "+ Add from library"
   open this URL, pre-filled via                                (in-page modal,
   query params — new browser tab                                not a route)
             │                                                          │
             │                                                   "Generate PDF"
      ┌──────┴────────┐                                          (file download,
      │/buildings/[id]│◄── click a card in library / a folder /   not a route)
      │ (view = edit) │    duplicate-warning "View/Edit instead"
      └──────┬────────┘
             │
     ┌───────┼────────────────────┐
     ▼                            ▼
┌─────────────────────┐  ┌──────────────────────────────────┐
│/buildings/[id]/      │  │/buildings/[id]/units/[unitId]/edit│
│  units/new            │  └──────────────┬────────────────────┘
└──────────┬────────────┘                 │
           └──────────submit──────────────┴──► back to /buildings/[id]

  /buildings/[id]/edit  — legacy route, immediately redirect()s to
                           /buildings/[id]. No page renders here; dead code,
                           not a dead end (kept only for old bookmarks).

┌──────────────────────────────────────────────────────────────────────────┐
│  ORPHANED — reachable only by typing the URL, nothing links here          │
│                                                                            │
│   /proposals ──"New Proposal"──► /proposals/new ──submit──► /proposals/[id]│
│                                                                            │
│   Contains its own QA gate (QAPanel) and its own PDF/export flow          │
│   (ExportPanel: PDF, PPTX, Excel, CSV, Word). Not linked from the nav     │
│   bar, not linked from the home page's 3 pillars, and its one former      │
│   entry point (SeedDemoButton, which used to land here after loading      │
│   demo data) is dead code — defined but imported nowhere.                 │
└──────────────────────────────────────────────────────────────────────────┘
```

**Nav bar** (present on every page): `Building library` · `Add building` · `Clients` — plus a
logo (→ `/`), back/forward history buttons, and the signed-in user + logout. `/import` and
`/proposals` are not in it.

**True dead ends:** none found — every page has at least one way forward (a submit redirect, a
"back to library" link via `PageHeader`, or the nav bar). The closest thing to a dead end is
`/proposals` and its children, which aren't a dead end once you're there (they link to each
other fine) but are an **island**: there is no path *into* them from anywhere else in the app.

---

## 2. Findings table

| Issue | Where | Severity | Fix effort |
|---|---|---|---|
| `/proposals` flow is completely unreachable from nav or home; its one entry point (`SeedDemoButton`) is dead, unused code | `NavBar.tsx`, `app/page.tsx`, `SeedDemoButton.tsx` | Blocks task | Small (decide: link it, or retire it — see §3) |
| Two/three separate, inconsistent ways to generate a client PDF: Library page direct-download, Client Folder direct-download (both no QA gate), and the separate Proposals→Export flow (QA-gated, multiple formats) | `BuildingLibrary.tsx`, `ClientFolder.tsx`, `ExportPanel.tsx`, `routers/library.py`, `routers/export.py` | Blocks task | Large (product decision needed) |
| `PhotoPicker` "Remove all" fires instantly, no confirmation — can wipe an entire captured photo set (up to dozens of photos) in one misclick | `PhotoPicker.tsx` (both variants) | Blocks task (data loss) | Small |
| `/library/pdf` fetch (library + client-folder PDF generation) has no timeout — if the backend hangs (known Railway connectivity issue), the button sits on "Generating…" forever with no escape but a page refresh | `BuildingLibrary.tsx`, `ClientFolder.tsx` | Blocks task | Small |
| No "Delete client" anywhere in the UI, despite `DELETE /clients/{id}` existing and cascading correctly on the backend | `apiCore.ts`, `app/clients/page.tsx`, `ClientFolder.tsx` | Slows task | Small |
| No unsaved-changes warning on any form (Building, Unit, Client, Proposal) — a nav click or back-button mid-edit silently discards typed input | All `*Form.tsx` components | Slows task | Medium |
| Gallery-variant `PhotoPicker` (used for buildings) has no way to add a photo by URL — only reorder/remove of what capture already found; the paste-URL row only exists in the grid variant (unit photos) | `PhotoPicker.tsx` | Slows task | Small–Medium |
| Nav bar has zero active-page highlighting anywhere in the app | `NavBar.tsx` | Minor polish | Small |
| Nav bar has no responsive/collapsed state — on a narrow phone viewport, back/forward icons + logo + 3 links + user name + logout will overflow or wrap messily | `NavBar.tsx` | Slows task (mobile) | Medium |
| Sticky bottom action bar (library & client-folder) uses `flex-wrap` with fixed `w-44` inputs; on a narrow screen it wraps to multiple rows and, being `position: fixed`, can grow tall enough to cover list content above the static `pb-40` buffer | `BuildingLibrary.tsx`, `ClientFolder.tsx` | Slows task (mobile) | Medium |
| Chrome extension's own fallback UI — the bookmarklet page (`/import`) — is entirely in Dutch, while the rest of the app is English | `ListingBookmarklet.tsx` | Minor polish | Small |
| Import-results copy also mixes Dutch ("Naar Add Building (plak-optie) →") | `ImportForm.tsx` | Minor polish | Small |
| `/clients/new` page copy describes the pre-client-folders mental model ("You'll pick them when you build the PDF") instead of "browse the library, add buildings to their folder" | `app/clients/new/page.tsx` | Minor polish | Small |
| Terminology drift for the same thing: "Building library" (nav), "Buildings & Units" (page eyebrows, import-result link), "library" (assorted copy) | Multiple | Minor polish | Small |
| `BuildingForm` "Discard" (edit mode) always navigates to `/buildings` (the whole library) instead of back to the specific building being edited | `BuildingForm.tsx` | Minor polish | Small |
| Confirmation is inconsistent even within one component: individual photo removal and "remove all" fire instantly, but building/client-folder deletion gets a full `ConfirmDialog` — same "irreversible-ish" stakes, different treatment | `PhotoPicker.tsx` vs `DeleteBuildingButton.tsx`/`RemoveFromFolderButton.tsx` | Minor polish | Small |
| No canonical amenities list — `AmenityMultiSelect` is a free-tag field with suggestions only, so the same amenity typed two ways ("EV charging" vs "Ev Charging") won't match/filter as one tag | `AmenityMultiSelect.tsx` | Minor polish | Medium (needs a real decision, flagged in code already) |
| Backend PDF failure surfaces only a generic "Could not generate the PDF" — no detail on *why* (bad data vs. backend error vs. timeout) | `routers/library.py` | Slows task | Small |

**Strengths worth preserving** (not everything is a problem):
- Duplicate-detection banner on `BuildingForm` fires as soon as address+city are known — before
  the rest of the form is filled in, and it's dismissible, non-blocking, and links straight to
  the existing draft.
- Chrome-extension capture → library loop is well closed: capture opens a *new tab* pre-filled
  for review (never silently auto-saves), and on save the broker lands back in the library with
  the new building already ticked and a clear "Added to your library" banner.
- The extension's own failure modes (verification/CAPTCHA page, timeout, nothing readable) are
  all surfaced with specific, actionable text — never a silent no-op.
- Photo duplicate detection (`PhotoPicker`) has a visible "Checking…" state, a toast on removal,
  and an Undo — a good model for what several other destructive actions in the app should do.
- Every list-type page's empty state was checked and all of them give a clear next action (empty
  library, empty client list, empty client folder, empty spaces table, empty photos).

---

## 3. Top 5 — highest severity, lowest effort, worth doing first

1. **Confirm before "Remove all" in `PhotoPicker`.** One misclick currently discards every
   captured photo with no recovery. Same `ConfirmDialog` already used for building deletion
   would close this in minutes.
2. **Put a timeout + friendly failure message on the `/library/pdf` fetch** in
   `BuildingLibrary.tsx` and `ClientFolder.tsx` (mirror the `AbortSignal.timeout` pattern
   `serverApi.ts` already uses). Right now a Railway hiccup — which we know happens — leaves the
   button stuck on "Generating…" indefinitely.
3. **Decide the fate of `/proposals`.** Either link it back into the nav/home (if it's still the
   intended path for QA-gated, multi-format exports) or retire it now, the same way the old
   Client-selections page was retired — right now it's live, fully functional, and invisible,
   which is the worst of both: dead weight in the UI surface with no equivalent visibility either
   way. This is really a product call, not a code fix, but it's cheap to *make* the call.
4. **Add a "Delete client" action.** The backend already does the right thing (cascades the
   folder's copies, leaves the library untouched); the UI just never exposes it.
5. **Add nav-bar active-state highlighting.** A one-line `usePathname()` check against each
   link — cheap, and it's the kind of polish that makes the app feel intentional everywhere,
   not just on the pages that got the most recent attention.

---

## 4. Everything else, grouped by flow

### a) Capture → library (Chrome extension)

Walked the actual extension code (`chrome-extension/popup.js`), not just the receiving page.

- Opening the popup immediately starts reading the page and building the handoff URL — by the
  time you'd reach for the "Capture" button, it's usually already done, so the click just opens
  a tab. Good latency design.
- Every failure path (page still loading, verification/CAPTCHA page detected, nothing readable,
  extension can't reach the app) ends in a specific, human-readable status message in the popup
  — never a silent failure or a button that just does nothing.
- When the page has fewer photos loaded than it claims to have (funda's "Foto's 37" but only 8
  in the DOM), the popup says so explicitly and tells you to open "Alle media" first — it does
  not silently under-capture.
- Capture opens `/buildings/new?...` in a **new browser tab**, pre-filled but not yet saved —
  this is a deliberate review step, and it's a good one, but it does mean the broker now has two
  tabs to manage (the listing, and the new form) for every single capture. Not a bug, just a
  friction point worth naming since the audit asked to trace the whole task.
- On save, the redirect target is `/buildings?select=<id>` — the broker lands back in the
  library with the new building pre-ticked and an "Added to your library" banner. This directly
  answers "does the broker know where to find it" — yes, clearly.
- Partial/failed scrape: the extension's own preview panel shows exactly what it did and didn't
  find before you ever leave the listing page, so a bad capture is visible *before* a new tab
  even opens.

### b) Manual building entry (`/buildings/new`, `BuildingForm.tsx`)

- Required fields (Name, Address, City) are marked with an accent-colored asterisk **and** carry
  native `required` attributes, so the browser blocks an empty submit before the app's own
  validation ever runs — no "submit, then discover what's wrong" cycle for the basics.
- Beyond the three required fields, nothing else is validated client-side, and the backend
  (Pydantic) will reject bad types with a 422 — `BuildingForm`'s `describeFailedResponse` helper
  does surface that FastAPI detail text rather than a bare "failed" message, so a validation
  error is at least legible, but it's a generic red paragraph at the bottom of a long form, not
  inline next to the offending field — a broker would need to scroll to find what's wrong on a
  long form.
- The "Executive summary — lease terms" section quietly creates the building's **first Unit**
  (and a parking AddOn) on submit if any of those fields are filled — this is explained in the
  card's own copy, but it's a non-obvious side effect for anyone skimming the form fast, worth
  keeping in mind if this ever gets rebuilt.
- No unsaved-changes guard: clicking "Discard," a nav link, or the browser back button while
  mid-form loses everything typed, with zero warning. This is not extension-specific — a
  30-field manual capture is exactly the case where losing it hurts most.
- "Discard" (edit mode) always routes to `/buildings` (the whole library), not back to the
  specific building being edited — small but avoidable disorientation.

### c) Duplicate handling

- The debounce (500ms) starts as soon as address+city exist and re-fires on every keystroke to
  either — this means for an extension capture (which arrives with address+city already filled),
  the duplicate warning can appear **immediately** on page load, before the broker has touched
  anything else. That's the right moment: before, not after, effort is sunk into the rest of the
  form.
- The warning distinguishes an incomplete draft ("consider completing that one instead") from a
  genuine possible duplicate, links straight to the existing record, and is dismissible with an
  explicit "Not a duplicate" — a broker isn't forced to fight the warning to keep working.
- Bulk import (`POST /imports/urls`) does its own server-side duplicate check instead (no human
  typing to debounce against) and merges into an existing near-duplicate above a confidence
  threshold rather than always creating a new row — consistent policy, just a different
  mechanism for a different input shape. Not flagged as an inconsistency; it's the right call for
  each mode.

### d) Client creation → add from library → client folder → PDF

Traced end to end as a fresh, real task:

1. `/clients` → "+ New client" (1 click)
2. `/clients/new` → fill name → submit (1 form + 1 click) → lands directly in the new,
   empty `/clients/[id]` folder — no extra navigation needed here, good.
3. Empty folder shows "No buildings added yet" + "+ Add from library" (1 click) → opens a
   slide-over modal reusing the same `BuildingCard` as the library.
4. Tick buildings (already-added ones are visibly locked, matched by `source_building_id`, so
   there's no way to double-add the same building) → "Add N to {name}'s folder" (1 click).
   Each tick performs its own deep-copy API call — `Promise.all` in parallel, so ticking 5
   buildings doesn't serialize 5 sequential round-trips.
5. Modal closes, folder now shows the copies with a "Copied from library on {date}" line and a
   link back to the master.
6. Fill "Prepared by" (optional) → "Generate PDF" (1 click) → file downloads.

**Total: ~4 required clicks + 2 short forms (client name; building ticks) for the full path**,
which is reasonable. Points of friction found along the way:
- Every step that mutates state (create client, add-from-library, remove-from-folder) does show
  a loading/disabled state on its own button ("Adding…", "Removing…") — no silent saves found
  in this flow specifically.
- The modal's own building list has no persisted search-across-open state — closing and
  reopening it re-fetches and resets the search box. Minor, since the modal is meant to be a
  quick in-and-out.
- "Generate PDF" has no timeout (see Top 5, #2) and no progress indicator beyond the button text
  — for a folder with many buildings this could be a real wait with no sense of how long is
  normal.
- There is no way to rename a client, edit their contact info, or delete them after creation —
  `ClientForm` only has a create path; `updateClient`/`deleteClient` exist in `apiCore.ts` but
  nothing in the UI calls them. A client folder, once created, is permanent and un-editable from
  the UI.

### e) Editing an existing building

- `/buildings/[id]` doubles as the edit screen (no separate `/edit` route in normal use — the
  old one now just redirects here). Saving calls `router.push` + `router.refresh()`, which
  re-renders the Server Component and shows fresh data immediately — confirmed no stale-data
  issue on save.
- Returning to `/buildings` afterward re-fetches server-side on every navigation (the route is
  dynamic, not statically cached), so the library list is never stale after an edit.
- Same unsaved-changes risk as manual entry (§b): no guard on navigating away mid-edit.
- Units and add-ons are edited on **separate pages/inline forms** below the building form itself
  — consistent with the comment in the code ("units are managed on the building's own page — an
  edit must never silently create a second unit"), and it works as described.

### f) Destructive actions — confirmation audit

| Action | Confirmation? | Assessment |
|---|---|---|
| Delete building (library) | Yes — `ConfirmDialog`, names the address, explains cascade | Appropriate |
| Remove building from client folder | Yes — `ConfirmDialog`, clarifies the master/other folders are untouched | Appropriate |
| Remove all photos (`PhotoPicker`) | **No** — fires instantly | **Under-confirmed** — flagged in Top 5 |
| Remove one photo (`PhotoPicker` ×) | No | Appropriate to skip — single item, easy to re-add |
| "Remove N that won't load" (bulk, broken photos) | No | Borderline, but defensible — these images are already useless, so little is actually being lost |
| Delete client | N/A — **action doesn't exist in the UI at all** | See Top 5, #4 |
| Delete proposal | Not checked in UI — no delete action found on `/proposals/[id]` | The Proposals flow has no delete at all, consistent with its general orphaned/unmaintained state |

No case of confirmation-fatigue (an overkill dialog for something trivial/reversible) was found
— every dialog encountered gates a genuinely hard-to-reverse action.

### g) PDF generation

- **Client-folder / library path** (`/library/pdf`): client-side `fetch` with no timeout, no
  progress indicator, button text changes to "Generating…" and back. On failure, the error
  handling is solid — it parses FastAPI's `{"detail": ...}` shape and shows the real reason, not
  a raw error. The gap is entirely on the *hang* case, not the *clean failure* case (see Top 5,
  #2). Backend-side, a genuine PDF-build error returns a generic `HTTPException(500, "Could not
  generate the PDF")` with no further detail either.
- **Proposals/Export path** (`ExportPanel.tsx`): notably more defensive — it detects a 409 (QA
  gate not passed) and gives an actionable message ("tick 'include unconfirmed figures'... or
  use the client PDF instead"), and it specifically catches "Internal Server Error" style bodies
  and rewrites them into "try the client PDF instead, it uses a different renderer" rather than
  showing raw server text. This is the better-built of the two PDF paths from a pure
  error-handling standpoint — worth pulling forward if/when the redundant-systems question
  (Top 5, #3) gets resolved, rather than discarding it.
- Neither path shows elapsed time, a spinner, or a cancel option during generation — for a large
  folder/proposal, a broker has no way to tell "still working" from "stuck."

---

## 5. Cross-cutting checks

**Navigation consistency** — No active-page highlighting anywhere (flagged, Top 5). Otherwise
consistent: every page uses the same `PageHeader` component, same "back to library" link
pattern, same button styling.

**Empty states** — Checked every list-type page: empty library, zero clients, empty client
folder, zero photos (both `PhotoPicker` variants), zero spaces on a building, zero add-ons, zero
proposals. All of them show a clear message and (except the add-ons list, which is fine without
one since the form is always visible below it) a specific next action or link. No blank pages
found.

**Loading states** — Every async mutation button was checked (save, create, delete, generate
PDF, start ingestion, add-from-library, etc.). All of them disable themselves and swap their
label to a present-participle ("Saving…", "Generating…", "Adding…") while in flight — a
consistent pattern across the whole app, just never a spinner icon. `IngestionPanel` is the one
flow with a real progress bar + live stat tiles, appropriately, since it's a genuinely long-
running background job with meaningful sub-progress to show.

**Error states** — Traced every `.catch()`/try-catch in the frontend. The dominant pattern is
solid: catch → `setError(message)` → render a small red paragraph, with real backend detail
text surfaced rather than a generic string, consistently across `BuildingForm`, `ClientForm`,
`ProposalForm`, `ClientFolder`, `ExportPanel`. Server Components (`buildings/page.tsx`,
`clients/page.tsx`, `proposals/page.tsx`, etc.) all wrap their data fetch in try/catch and show a
"can't reach the database, your data is safe" card rather than crashing — good, consistent
degrade-gracefully behavior for backend-unreachable scenarios specifically. The one class of
failure not covered anywhere is a **hang** rather than a clean error (see §g and Top 5, #2) —
every `.catch()` handles rejection, nothing handles "never resolves."

**Back-button / browser-navigation behavior** — No modal or form state was found that survives
incorrectly across a back-navigation (React state resets on remount as expected, since nothing
here uses non-Next global state that would leak). The one real risk is the unsaved-changes case
already covered in §b/§e — back-button silently discarding typed input — which is a data-loss
risk, not a broken-UI-state risk.

**Mobile/narrow-viewport** — Two things would be actively broken, not just non-optimal:
1. Nav bar has no responsive collapse (Top 5-adjacent, in the findings table) — back/forward
   icons, logo, 3 nav links, user name, and logout in one un-wrapping flex row will not fit a
   360–390px phone viewport.
2. The sticky bottom action bar in `BuildingLibrary`/`ClientFolder` is `position: fixed` with
   `flex-wrap` — on a phone it wraps to 2–3 rows, and because it's fixed-height-agnostic, it can
   grow tall enough to sit over list content that the page's static `pb-40` buffer didn't
   anticipate.

Everything else checked (photo gallery grid, modals, forms, tables) either already uses
responsive Tailwind classes correctly or degrades acceptably (e.g. the units table scrolls
horizontally inside its own `overflow-x-auto` wrapper rather than breaking the page).

**Redundant or competing patterns** — Two real ones found, beyond what's already called out:
1. **PDF generation, three ways** (library, client folder, proposals) — the headline finding of
   this audit; see Top 5 #3 and §g.
2. **No canonical amenities list** — not two competing *systems*, but a single free-tag field
   with only suggestions, no enforced values, meaning the "same" amenity can exist as multiple
   distinct strings across buildings/units with no way to reconcile them later. Flagged in the
   findings table; the component's own code comment already notes this was a deliberate,
   provisional choice pending a real decision.

No leftover trace of the previously-retired "Client selections" system was found — that
migration was clean; only the currently-active Client Folders model exists in the UI now. The
Proposals system is the one still-live, still-parallel path that never got resolved the same
way.
