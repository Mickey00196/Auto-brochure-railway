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

Address / postcode / city, floor area (m²), energy label, year built, a
description, amenities, and photo URLs — pulled from the page's structured data
(JSON-LD), OpenGraph/meta tags, and visible text. Whatever it can't find is left
blank for you to complete. It never invents values.

## Notes

- Fields are best-effort from whatever the page exposes; always sanity-check
  before saving.
- Photos are the listing's images (copyright of the source/agent) — fine for
  internal reference; get permission before putting them in client-facing
  brochures.
