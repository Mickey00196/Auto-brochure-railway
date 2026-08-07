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

None normally — captures go to your deployed app out of the box. If the app
ever moves, open the popup → **Settings**, paste the new address, and click
**Save address** (no reinstall, no code editing).

## Use

1. Open a listing page in your browser and make sure the real listing (not a
   verification page) is loaded.
2. Click the extension button. The page is read **while the popup opens**, so
   the preview is already filled in and the status line says how long it took.
3. Click **Capture this listing** — the tab opens immediately, because there
   is no work left to do at that point.
4. The tab shows **Add Building** pre-filled with everything found. Review it,
   fill in anything the listing didn't state, and click **Save to library**.
   You must be logged into the app in that browser.

## What it captures

The full executive summary of an office listing, pulled from the page's
structured data (JSON-LD), its characteristics table ("Kenmerken"), OpenGraph/
meta tags, and visible text:

- Name, address / postcode / city, and **subarea** (from the breadcrumb, e.g.
  "Buiksloterham-Zuid" → the building's Submarket)
- **Available office space** (m²) and the **smallest lettable unit**
  ("5.773 m² (in units vanaf 280 m²)" → 5,773 available, from 280). On funda
  in business the "Oppervlakte" row is the space being *offered*, not the size
  of the building — the total building area is only filled from a label that
  genuinely means the whole building, and otherwise stays blank.
- **Parking ratio**, from the characteristics row or the description prose
  ("Parking ratio: 1 space per 348 m² LFA" → 1:348 m² LFA). The reference unit
  is kept, since 1:348 LFA is not the same promise as 1:348 BVO.
- **Rental price office** (€/m²/year — only when the page states a per-m²
  figure; a lump-sum monthly rent is a different quantity and is left blank)
- **Rental service charges** (€/m²/year)
- **Rental price parking space** (€/space/year; per-month figures ×12)
- **Available** (acceptance, e.g. "Per direct" / "In overleg")
- **Energy rating** and **year of construction**
- **Amenities in building** — matched against a vocabulary of NL/EN spellings
  (gym, supermarket, cinema, bars, bicycle parking, underground car park,
  lifts, EV charging, meeting rooms, showers, sustainability certifications…)
  and normalised to one tidy label each. They appear as chips in the library
  and as their own column in the client PDF.
- **Distances**: airport, public transport, and highway (e.g. "NS-station
  800 m", "Afrit snelweg 1,2 km")
- Description and photo URLs

Saving the pre-filled form creates the Building **and its first Unit** carrying
the lease terms (plus a parking add-on when a parking price was found), so a
captured office lands complete. Whatever the page doesn't state is left blank
for you to complete — it never invents values.

## If it doesn't work

- **No icon in the toolbar.** Click the puzzle-piece icon and pin
  "Proposal Engine – Listing Capture". From v2.0 it has its own navy building
  icon, so it's easy to spot.
- **Popup won't open at all / greyed out.** Chrome runs an unpacked extension
  from the folder you loaded it from — if that folder was moved or deleted,
  it breaks. Remove the entry at `chrome://extensions` and **Load unpacked**
  again from wherever the folder lives now (keep it somewhere permanent, not
  Downloads).
- **Capture opens a "site can't be reached" tab.** The saved app address is
  wrong — fix it under Settings.
- **The form opens but is empty.** You were logged out; log in and the
  captured values are carried through the login (fixed in the app, not here).
- **A detail is missing that the listing clearly states.** Details hidden
  behind a "Lees meer" / "Read more" toggle used to be invisible to the
  capture (the parking ratio, typically). From v2.3 the collapsed text is read
  too, so expanding the description first is no longer necessary.
- **Fewer photos than the listing advertises.** The extension can only read
  what your browser has actually loaded. A listing page ships a handful of
  gallery images and fetches the rest only when you open **Alle media** — so
  if the popup says "5 of 37 on this page", open Alle media on the listing,
  then reopen the popup and all of them come through. (The handoff link also
  has a length limit, but at 8KB it comfortably fits a full 37-photo gallery;
  anything dropped is still reported.)

## Notes

- Fields are best-effort from whatever the page exposes; always sanity-check
  before saving.
- Photos are the listing's images (copyright of the source/agent) — fine for
  internal reference; get permission before putting them in client-facing
  brochures.
