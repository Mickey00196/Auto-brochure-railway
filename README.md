# Real Estate Proposal Engine (v2)

A CRE brochure/PPTX/PDF generation engine, built from the ground up around
gaps found in two real reference documents:

1. A 7-listing direct-lease brochure ("Office Shortlist · Amsterdam 2026")
   whose flat, one-record-per-listing data model couldn't represent
   multi-unit buildings, TBD pricing, or a computed all-in rate — and which
   shipped a genuine cross-page pricing inconsistency.
2. A real "Market Inventory" flex-office template — diagonal red/white brand
   motif, per-desk/month pricing, region-grouped map pages, a closing
   Project Team page — which this generator's PPTX/PDF layout now matches
   directly (see [Template match](#template-match-market-inventory) below).

The table below is the short version of the first document's gap-to-fix
mapping; see the project spec for the full rationale.

| # | Gap in a flat model | Fix, and where it lives |
|---|---|---|
| 1 | One building, one price/size record | `Building` + `Unit` split — [`backend/app/models/building.py`](backend/app/models/building.py), [`unit.py`](backend/app/models/unit.py) |
| 2 | Rent as a bare number can't represent "TBD" | `rent_price_type` / `service_charge_price_type` enums — [`backend/app/models/enums.py`](backend/app/models/enums.py) |
| 3 | Same transit fact repeated on every listing | `Neighbourhood` entity, inherited by Buildings — [`neighbourhood.py`](backend/app/models/neighbourhood.py) |
| 4 | Parking costs buried in free text | `AddOn` entity — [`addon.py`](backend/app/models/addon.py) |
| 5 | Overview table and detail page can silently disagree | Single-source-of-truth rule + `check_source_conflicts` — [`services/qa.py`](backend/app/services/qa.py) |
| 6 | Contract term not modeled at all | First-class `contract_term` field on `Unit` |
| 7 | No combined €/m²/yr or annual cost | Comparison Generator computes both — [`services/comparison.py`](backend/app/services/comparison.py) |
| 8 | No concept of "a dated selection sent to one client" | `Client` + `Proposal` entities — [`client.py`](backend/app/models/client.py), [`proposal.py`](backend/app/models/proposal.py) |

## Template match ("Market Inventory")

The PPTX/PDF layout mirrors the real flex-office template page-for-page:

- **Cover** — diagonal red panel (freeform polygon, not a rotated rectangle),
  white logo bar, document type / client name / search area / date.
- **Search Profile** — corner diagonal accent, field rows from the client's
  search brief.
- **Per Region divider + region map pages** — Units are grouped by
  `Building.submarket` in first-seen order; each region gets a real
  (or gracefully-placeholdered) Google Static Maps image with one numbered
  pin per **unit** — not per building, since two units sharing a building
  (gap #1) still need two distinct, separately-numbered listings.
- **Unit fact sheets** — one page per unit: photo + numbered badge,
  CHARACTERISTICS / REMARKS columns, and an Accessibility / Transport /
  Airport stat row — replacing this generator's original 3-slide
  title-card/detail/gallery block.
- **All Properties Overview** — full map + two-column numbered address list.
- **Comparison + Recommendation** — this engine's own value-add the source
  template doesn't have (§16): a computed all-in rate / monthly cost the
  source template's author would otherwise have to work out by hand.
- **Project Team** — closing page with diagonal design and contact cards.

Two pricing models coexist because the two source documents use different
ones — see `Unit.pricing_model` (`PricingModel` enum,
[`enums.py`](backend/app/models/enums.py)):

- `per_sqm_annual` — direct lease, €/m²/year (the original 7-listing gap
  table).
- `per_desk_monthly` — flex/serviced office, €/desk/month (the Market
  Inventory template). QA (`check_tbd_headline_fields`) and the Comparison
  Generator (`build_comparison_row`/`_sort_key`) both branch on this field
  so the two are never conflated — a flex unit's price lives in
  `price_per_desk_month_eur`, not `rent_eur_per_m2_year`, and ranks
  separately in the comparison table rather than being forced onto the same
  €/m²/yr scale.

The demo seed data reflects both: 7 direct-lease units (the original gap
dataset, unchanged) plus one `per_desk_monthly` unit ("Prinseneiland 12"),
split across 2 regions ("Houthavens Waterfront" / "Houthavens Central") to
exercise the Per Region grouping.

## Same schema, two ways in

A Building/Unit added through the manual form (`/buildings/new`,
`/buildings/[id]/units/new`) and one created by pasting a URL
(`/import`, §7) write to the *exact same* `Building`/`Unit`/`AddOn` ORM
models — there's no separate "scraped listing" table. `tests/
test_schema_parity.py` proves this at the API boundary rather than just by
inspection: it creates one building each way and asserts the JSON responses
expose identical field sets, so a future change that adds a field only one
path populates breaks the test immediately instead of silently drifting.

What genuinely differs between the two paths is *coverage*, not *shape* —
a scraper can only extract what a generic HTML parser can find (see
Workflow 2 below), so a scraped building may leave more fields as
`tbd`/`None` than a manual entry would. Every one of those fields is
still there to fill in by hand afterward via the same forms.

The Proposal builder (`/proposals/new`) reflects the other half of this:
building the list is entirely check-boxes against the existing Building/Unit
database — it never asks for building details to be re-typed at that stage.

## Architecture

```
backend/   FastAPI + SQLAlchemy + Pydantic — the actual engine
  app/models/       §5 data model (Building, Unit, AddOn, Neighbourhood, Client, Proposal)
  app/services/      business logic
    qa.py                §8  — single-source-of-truth, TBD gating (both pricing models), copy lint, price outliers
    comparison.py        §16 — all-in rate / monthly cost, pricing-model-aware sort
    matching.py          §12 — Property Matching scores Units, not just Buildings
    description_generator.py  §9  — pluggable AI copy provider (deterministic fallback)
    assistant.py          §17 — pluggable NL query parser (regex fallback) + email drafting
    image_engine.py       §10 — dedupe + category ranking (real); download/upscale (documented stub)
    maps.py                §11 — real Google Static Maps URL builder + image fetch (needs GOOGLE_MAPS_API_KEY); graceful placeholder fallback
    scraping/              §7  — subdivision-preserving parsing (real); live fetch (documented stub)
    brochure/
      pptx_generator.py    §14 — PowerPoint as the primary render target, matching the Market Inventory template
      slide_kit.py           — diagonal freeform panels, numbered badges, stat-icon rows
      pdf_export.py         §14 — PDF as a flattened export of the same slides (LibreOffice headless)
      one_pager.py           §15 — single-slide executive summary
      theme.py                §22 — white-labelable palette
    export_formats.py      §20 — CSV / Excel / Word
  app/routers/        REST API — one file per resource/concern (incl. imports.py, §7/Workflow 2)
  app/auth.py           email/password login, JWT issuing/verification — every route below
                        requires a logged-in user (see "Team accounts" below)
  app/cli.py             admin-only account provisioning (no public signup)
  app/seed/            reference-brochure demo dataset (8 units / 5 buildings / 2 regions)
  tests/               64 tests — pytest, incl. test_schema_parity.py, test_auth.py
  Dockerfile           installs libreoffice-impress + playwright chromium, runs uvicorn

frontend/  Next.js (App Router) + TypeScript + Tailwind
  src/app/             Dashboard (§18), Buildings & Units (+ manual add-building/add-unit forms),
                       Import from URLs, Clients, Proposals (list/new/detail), /login
  src/app/api/           login/logout Route Handlers (set/clear the httpOnly session cookie),
                        proxy/[...path] — every browser-side request goes through this so the
                        session JWT never reaches client JS (see "Team accounts" below)
  src/components/       BuildingForm, UnitForm, AddOnForm — manual entry (Workflow 1)
                        QAPanel, ComparisonTable, ExportPanel — the Proposal detail workspace
                        ImportForm — Workflow 2
  src/lib/api.ts          client components' API client — calls the same-origin proxy
  src/lib/serverApi.ts    Server Components' API client — calls the backend directly,
                          reading the session cookie server-side (never imported by client code)
  src/proxy.ts            the one auth gate: no valid session cookie, no page render
  Dockerfile             multi-stage build using `output: "standalone"`

docker-compose.yml    local parity with production: Postgres + both Docker images
render.yaml            one-click Render Blueprint (Postgres + both services)
backend/railway.json   Railway service config (Dockerfile build, healthcheck)
frontend/railway.json  Railway service config (Dockerfile build)
```

## Running it

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload   # http://localhost:8000, tables auto-created (SQLite by default)
```

PDF export (`/proposals/{id}/export/pdf` and `/export/one-pager`) shells out to
LibreOffice headless. Only `libreoffice-core` ships filters for nothing at
all — you need the Impress component too:

```bash
sudo apt-get install -y libreoffice-impress
```

Region map pages render a real Google Static Maps image when
`GOOGLE_MAPS_API_KEY` is set; without it, `fetch_static_map_image` returns
`None` and the generator falls back to a clearly-labeled placeholder — it
never fails the export.

Point `DATABASE_URL` at Postgres (Supabase, per the spec's intended stack) in
production; SQLite is the zero-config default for local dev.

Every route except `/health` and `/auth/login` requires a logged-in user — see
"Team accounts" below. Set `JWT_SECRET_KEY` to a real random value in any
deployment reachable over a network (`python -c "import secrets;
print(secrets.token_hex(32))"`); the code falls back to an insecure hardcoded
value if unset, purely so `pytest` and local `--reload` runs work with zero
setup.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # INTERNAL_API_BASE_URL, defaults to http://localhost:8000
npm run dev                  # http://localhost:3000
```

The browser never talks to the FastAPI backend directly — `INTERNAL_API_BASE_URL`
is a server-only env var (no `NEXT_PUBLIC_` prefix, so it never ships to client
JS) used by Server Components and by the `/api/proxy/*` Route Handler that
every client-side request goes through instead. See "Team accounts" below for
why, and for how to log in.

### Tests

```bash
cd backend && source .venv/bin/activate && python -m pytest
```

64 tests, each traceable to either a spec section or a specific line in the
reference brochure's gap table (§1) — e.g. `test_flags_service_charge_mismatch_between_sources`
regression-tests the exact €55/€60 conflict shape, and `test_schema_parity.py`
regression-tests manual vs. scraped Buildings never diverging into different
schemas.

## Team accounts (auth)

Public signup is **off by default** — accounts are normally provisioned by
whoever's running the deployment, then colleagues log in at `/login` with the
email/password they were given. Every logged-in user sees and can edit every
Building, Client, and Proposal; there's no per-user data scoping, only a
"you must be logged in" gate in front of the whole app (this is meant as a
small-team internal tool, not a multi-tenant product) — so think about who
you're handing access to before turning signup on.

**To allow signup anyway** (e.g. testing solo, or a team that's fine sharing
everything): set `ALLOW_SIGNUP=true` on the backend service and redeploy.
`/signup` on the frontend (linked from the login page) then lets anyone who
reaches it create their own `broker`-role account — no invite needed. Turn
`ALLOW_SIGNUP` back off once you don't want new accounts self-created anymore;
existing accounts keep working either way.

**Without signup enabled**, provision an account with a shell into the
backend (Render's "Shell" tab, `render ssh`, Railway's Console tab, etc.):

```bash
cd backend
python -m app.cli create-user --email sam@yourcompany.example --name "Sam de Boer" --password "..." --role broker
python -m app.cli list-users
```

**No shell access available?** (e.g. a PaaS console that fails to route to
the container) — set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (optionally
`ADMIN_NAME`) on the backend service and redeploy/restart it. On startup, if
no user with that email exists yet, it's created as an `admin`. It's a
no-op on every later restart once that email exists, so it's safe to leave
the variables set — but treat them as a one-time bootstrap, not an ongoing
password reset mechanism (changing `ADMIN_PASSWORD` later does nothing for
an already-created account).

Run this with `DATABASE_URL` pointed at whichever database the deployment
actually uses — locally that's the SQLite default; in production, set
`DATABASE_URL` in your shell to the same Postgres connection string the
backend service uses (Render: copy it from the backend service's environment
tab, or `render ssh proposal-engine-backend` and run the command there
directly against the already-configured environment).

**How the login itself works**, since it's easy to get wrong for an app split
across two services: the backend issues a JWT on `POST /auth/login`. The
frontend's `/api/login` Route Handler is the only thing that ever sees that
token — it stores it in an `httpOnly` cookie, so it's never readable by
browser JS at all (an XSS bug can't read it out of `localStorage` or
`document.cookie`, unlike a Bearer-token-in-the-browser approach). Server
Components read that cookie directly and call the backend server-to-server
(`src/lib/serverApi.ts`); client components instead call a same-origin
`/api/proxy/[...path]` Route Handler that reads the cookie and forwards the
request with the bearer token attached (`src/lib/api.ts`) — so client-side
code never has the token to leak in the first place. `src/proxy.ts` is the
single gate: no valid, unexpired session cookie means no page render,
redirect to `/login`, checked before anything else runs.

## Deploying it

**Render** (recommended — `render.yaml` in the repo root is a one-click
Blueprint):

1. Push this repo to GitHub.
2. Render dashboard → **New > Blueprint** → point it at the repo. This
   provisions a managed Postgres database, the backend (Docker, from
   `backend/Dockerfile`), and the frontend (Docker, from
   `frontend/Dockerfile`) — `DATABASE_URL` and `INTERNAL_API_BASE_URL` are
   wired up automatically between them, and `JWT_SECRET_KEY` is auto-generated.
3. Optionally set `GOOGLE_MAPS_API_KEY` on the backend service (dashboard →
   Environment) — region map pages fall back to a labeled placeholder without
   it, nothing breaks.
4. Provision your colleagues' accounts (see "Team accounts" above).

The `free` plan is the right starting point for a backtest: free web services
spin down after 15 minutes of inactivity (the first request after a lull
takes ~30s to wake back up) and the free Postgres database expires after 30
days — fine for kicking the tires, not for something colleagues rely on
long-term. Bump `plan:` in `render.yaml` when you're ready to commit to it.

**Railway**: each service carries its own `railway.json` (`backend/`,
`frontend/`) so Railway builds straight from the Dockerfiles instead of
guessing.

1. Push this repo to GitHub.
2. Railway dashboard → **New Project** → **Deploy from GitHub repo** → pick
   this repo.
3. Add the backend service: **New → GitHub Repo** (same repo again) → set
   **Settings → Root Directory** to `backend`. Railway picks up
   `backend/railway.json` and builds `backend/Dockerfile`.
4. Add the frontend service the same way, with **Root Directory** set to
   `frontend`.
5. Add Postgres: **New → Database → PostgreSQL**. Railway exposes it as
   `DATABASE_URL`; reference it on the backend service (Variables tab →
   `DATABASE_URL` → `${{Postgres.DATABASE_URL}}`).
6. Backend service variables: `DATABASE_URL` (above), `JWT_SECRET_KEY` (a
   real random value — see "Team accounts" above), optionally
   `GOOGLE_MAPS_API_KEY`.
7. Frontend service variables: `INTERNAL_API_BASE_URL` set to the backend's
   private networking address, `${{backend.RAILWAY_PRIVATE_DOMAIN}}:8000`
   (swap `backend` for whatever you named that service) — Railway's private
   network doesn't need a scheme, `internalApiBaseUrl()` adds `http://` if
   one's missing.
8. Both services listen on Railway's injected `$PORT` (the backend's
   `CMD` resolves it at container start; Next's standalone `server.js`
   reads it natively) — no manual port configuration needed.
9. Provision your colleagues' accounts (see "Team accounts" above), using
   `DATABASE_URL` from the backend service's Variables tab.

Railway has no free-tier sleep/spin-down like Render's free plan, but usage
is metered — keep an eye on the project's usage dashboard if this is just a
backtest.

**Anywhere else that runs Docker** (a VPS, another PaaS, your own
Kubernetes): `docker-compose.yml` in the repo root runs the same two images
plus a local Postgres for parity testing —

```bash
JWT_SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))") docker compose up --build
```

— then provision accounts the same way, against that container's database.
Whatever platform you use, the app must be served over HTTPS: the session
cookie is marked `Secure` automatically once it detects the request came in
over HTTPS (directly, or via a `x-forwarded-proto: https` header from a
reverse proxy — the standard most PaaS load balancers already set), and a
`Secure` cookie is silently dropped by the browser over plain HTTP.

## Workflows (§4)

1. **From the database** — build a Building by hand at `/buildings/new`, add
   Units to it at `/buildings/[id]/units/new`, then select existing Units by
   clicking checkboxes (never re-typing details) at `/proposals/new` to add
   them to a Proposal. `POST /buildings`, `POST /units`, and `POST /proposals`
   cover the same paths via the API directly. Every export reads from that
   one Proposal record.
2. **From external URLs** — paste one or more listing URLs at `/import` in the
   frontend, or `POST /imports/urls` directly. Each URL is rendered with the
   pre-installed Playwright Chromium (`fetch_rendered_html`) and parsed with
   BeautifulSoup (`parse_html`): title, address/city (best-effort, from the
   page title), meta description, photos (logo/icon images filtered out),
   amenities (keyword-matched against a fixed vocabulary), year built, energy
   label, and rent/service charge/contract term/parking each anchored to
   their own keyword in the page text (not just "the first price on the
   page") — preserving unit-level subdivision ("320 m², units from 120 m²" →
   total + minimum divisible, never collapsed). This writes to the exact same
   `Building`/`Unit`/`AddOn` schema Workflow 1 does — see "Same schema, two
   ways in" above. Every field it can't resolve is stored as `tbd`/omitted
   rather than blank or guessed (§24) — e.g. an address that doesn't look
   like "Street Number, City" in the title is left `"TBD"` for a human to
   fill in via the same building-detail page, not invented. Each URL in a
   batch succeeds or fails independently, so one bad link doesn't block the
   rest. Verified end-to-end (real Chromium render → parse → stored
   Building/Unit/AddOn, through the actual `/import` page) against a local
   fixture page; live third-party sites need outbound network access this
   environment doesn't have, so `fetch_rendered_html` itself isn't exercised
   by the automated test suite (`parse_html` and the router's create/error-
   handling logic are — see `tests/test_scraping.py` and
   `tests/test_imports.py`).

## What's a real implementation vs. a documented stub

Fully implemented, tested, and exercised end-to-end (backend tests + a live
browser run against both servers, including a downloaded PPTX opened and
verified, and a real Chromium-rendered import against a local fixture page):

- Data model (incl. dual pricing models), seed data, QA pass, Comparison
  Generator, PPTX/PDF/one-pager generation matching the Market Inventory
  template, CSV/Excel/Word/JSON export, Property Matching, Dashboard, the
  assistant's regex-based NL parser, manual Building/Unit/AddOn entry forms,
  URL import (Workflow 2, §7) end-to-end including its frontend page and its
  schema parity with manual entry, and the rest of the Next.js frontend.
- Team login (§19) — email/password auth, JWT-gated API, httpOnly-cookie
  session, admin-provisioned accounts. Verified with a real Playwright
  browser run against both servers: wrong password rejected, correct login
  works, a client-side mutation and a file export both succeed through the
  authenticated proxy, logout revokes access, unauthenticated visits to any
  page redirect to `/login`.

Documented, pluggable interfaces with a working deterministic fallback,
left for a real integration once credentials/network are available:

- **§9/§17 AI copy & assistant** — `get_description_provider()` returns a
  template-based provider today; swap in an LLM-backed one behind the same
  interface.
- **§11 Maps** — `build_region_map_url` builds a correct, provider-agnostic
  Google Static Maps request (numbered markers, grayscale style) and
  `fetch_static_map_image` will download the real tile the moment
  `GOOGLE_MAPS_API_KEY` is set; until then it returns `None` and the caller
  falls back to a placeholder rather than failing.
- **§10 Image Engine** — dedupe and category-ranking logic is real; the
  download/upscale/perspective-correction pipeline needs network access to
  source images and an ML stack, and is documented as a `NotImplementedError`
  plug point.
- **§7 Scraping (live fetch)** — see Workflows above.

Every one of these is a config/credential change away from being live, not a
rewrite — that boundary was a deliberate design choice given this
environment's constraints, not an oversight.

## Design (§22)

Default theme is the reference documents' own palette (near-black title
cards / diagonal red panels, single red accent, white detail pages) — see
`backend/app/services/brochure/theme.py`'s `Theme` dataclass. Pass a
different `Theme` into the PPTX/one-pager generators to white-label per
brokerage/tenant-rep firm.

All names in the seed data — client, brokers, buildings, the flex-office
brand "Flexspace Central" — are fictional; no real company's brochure,
staff, or contact details are reproduced anywhere, including the closing
Project Team page.
