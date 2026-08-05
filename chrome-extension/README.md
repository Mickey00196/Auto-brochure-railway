# Proposal Engine – Listing Capture (Chrome extension)

One-click capture of a listing page **you are already viewing** into the
Proposal Engine's *Add Building* form. No retyping, no copy-paste.

## Why this is compliant

The extension **does not fetch anything**. You open the listing in your own
browser as a normal visitor (your own connection, your own session — you pass
any verification page as a human). The extension only **reads the page your
browser already rendered** and opens the Add Building form pre-filled with what
it found. There is no automated request to the source, no bot, and nothing that
tries to get around a site's access controls. It is the copy-paste flow, made
one click.

Because it only reads an already-open page, it does **not** get past a block
for pages you can't open yourself — if you see a verification page, so does the
extension, and it will say so instead of capturing garbage.

## Install (unpacked)

1. Open `chrome://extensions` in Chrome (or Edge: `edge://extensions`).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this `chrome-extension/` folder.
4. Pin the extension (puzzle-piece icon → pin) so its button is visible.

## Setup

None — the app URL is hardcoded in `popup.js` (the `APP_URL` constant at the
top). If your Proposal Engine ever moves, change that one line and reload the
extension.

## Use

1. Open a listing page in your browser and make sure the real listing (not a
   verification page) is loaded.
2. Click the extension button → **Capture this listing**.
3. A new tab opens with **Add Building** pre-filled (name, address, city, area,
   energy label, amenities, photos). The popup also shows how many photos were
   captured. Review it, fill in anything missing, and click **Create Building**.
   You must be logged into the app in that browser.

## What it captures

The full executive summary of an office listing, pulled from the page's
structured data (JSON-LD), its characteristics table ("Kenmerken"), OpenGraph/
meta tags, and visible text:

- Name, address / postcode / city, and **subarea** (from the breadcrumb, e.g.
  "Buiksloterham-Zuid" → the building's Submarket)
- **Total surface** and **available surface approx.** (m²)
- **Parking ratio** (e.g. 1:80)
- **Rental price office** (€/m²/year — only when the page states a per-m²
  figure; a lump-sum monthly rent is a different quantity and is left blank)
- **Rental service charges** (€/m²/year)
- **Rental price parking space** (€/space/year; per-month figures ×12)
- **Available** (acceptance, e.g. "Per direct" / "In overleg")
- **Energy rating** and **year of construction**
- **Amenities in building**
- **Distances**: airport, public transport, and highway (e.g. "NS-station
  800 m", "Afrit snelweg 1,2 km")
- Description and photo URLs

Saving the pre-filled form creates the Building **and its first Unit** carrying
the lease terms (plus a parking add-on when a parking price was found), so a
captured office lands complete. Whatever the page doesn't state is left blank
for you to complete — it never invents values.

## Notes

- Fields are best-effort from whatever the page exposes; always sanity-check
  before saving.
- Photos are the listing's images (copyright of the source/agent) — fine for
  internal reference; get permission before putting them in client-facing
  brochures.
