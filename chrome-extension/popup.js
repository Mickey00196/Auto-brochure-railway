"use strict";

// Where captures are sent. Overridable from the popup's Settings (stored in
// chrome.storage.sync) so a moved app can be fixed without editing the code.
const DEFAULT_APP_URL = "https://proposal-engine-frontend-production.up.railway.app";

// A handoff URL that grows past what proxies/servers accept comes back as a
// 414/431 error page instead of the form — and a funda gallery of 15 CDN URLs
// gets there easily. Photos are dropped from the tail until it fits; the
// building itself always survives.
// The app serves a ~13KB URL fine and only 431s past ~17KB (Node's 16KB
// header ceiling, shared with cookies). 8KB leaves generous headroom for a
// stricter proxy while fitting a full 37-photo gallery (~3.8KB) with room to
// spare — the old 3.5KB limit was silently dropping the tail of the gallery.
const MAX_HANDOFF_URL_LENGTH = 8000;

// storage.local, not .sync: sync storage round-trips through Chrome's sync
// service and can stall the popup for hundreds of ms on first read. The app
// address is a per-machine setting, so local is both faster and the right fit.
async function getAppUrl() {
  const { appUrl } = await chrome.storage.local.get({ appUrl: DEFAULT_APP_URL });
  return String(appUrl || DEFAULT_APP_URL).replace(/\/+$/, "");
}

// Runs INSIDE the listing tab (injected via chrome.scripting.executeScript).
// Must be fully self-contained — no references to popup scope. It only READS
// the DOM the user's browser already rendered; it never fetches anything.
// Mirrors the backend parser (JSON-LD → OpenGraph/meta → visible-text
// heuristics), so captured data matches what a manual import produces.
function extractListing() {
  const BLOCK = [
    "je bent bijna op de pagina die je zoekt",
    "even geduld",
    "checking your browser",
    "verify you are human",
    "captcha",
  ];
  const bodyText = (document.body ? document.body.innerText : "") || "";
  if (BLOCK.some((m) => bodyText.toLowerCase().includes(m))) {
    return { blocked: true };
  }

  // innerText only returns what is *visible*. Listing descriptions are very
  // often collapsed behind a "Lees meer" / "Read more" toggle, and details
  // stated only in that hidden part (the parking ratio, typically) would be
  // invisible to every prose match below. Walk the text nodes instead —
  // scripts and styles excluded, so inline JSON can't pollute the matches —
  // and use that wherever we search prose rather than structure.
  const collectText = () => {
    if (!document.body) return "";
    const SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, SVG: 1 };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentNode;
        if (parent && SKIP_TAGS[parent.nodeName]) return NodeFilter.FILTER_REJECT;
        return node.nodeValue && node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const parts = [];
    let length = 0;
    let node;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue.trim();
      parts.push(text);
      length += text.length + 1;
      if (length > 600000) break; // plenty for any listing; keeps huge pages quick
    }
    return parts.join("\n");
  };
  // Visible text first (keeps line order meaningful), then anything hidden.
  const fullText = bodyText + "\n" + collectText();

  const out = {
    name: null, address: null, street: null, houseNumber: null,
    postalCode: null, city: null, description: null, energyLabel: null,
    yearBuilt: null, areaSqm: null, minDivisibleAreaSqm: null, amenities: [], photos: [],
    // Executive summary
    subarea: null, availableAreaSqm: null, parkingRatio: null,
    rentEurPerM2Year: null, serviceChargeEurPerM2Year: null,
    parkingPriceEurYear: null, availability: null,
    airportNote: null, highwayNote: null, publicTransportNote: null,
  };
  const pick = (sel, attr) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const v = attr ? el.getAttribute(attr) : el.textContent;
    return v ? v.trim() : null;
  };

  // --- JSON-LD ---
  for (const b of document.querySelectorAll('script[type="application/ld+json"]')) {
    let data;
    try { data = JSON.parse(b.textContent); } catch (e) { continue; }
    const arr = Array.isArray(data) ? data : (data["@graph"] ? data["@graph"] : [data]);
    for (const o of arr) {
      if (!o || typeof o !== "object") continue;
      if (o.name && !out.name) out.name = String(o.name);
      if (o.description && !out.description) out.description = String(o.description);
      const a = o.address;
      if (a && typeof a === "object") {
        out.street = out.street || a.streetAddress || null;
        out.postalCode = out.postalCode || a.postalCode || null;
        out.city = out.city || a.addressLocality || null;
      }
      const img = o.image;
      if (img && out.photos.length === 0) {
        out.photos = (Array.isArray(img) ? img : [img]).filter(Boolean);
      }
    }
  }

  // --- OpenGraph / meta fallback ---
  if (!out.name) out.name = pick('meta[property="og:title"]', "content") || pick("title");
  if (!out.description)
    out.description = pick('meta[name="description"]', "content") || pick('meta[property="og:description"]', "content");
  if (out.photos.length === 0) {
    const ogi = pick('meta[property="og:image"]', "content");
    if (ogi) out.photos = [ogi];
  }

  // --- number normalization (Dutch + English grouping) ---
  const parseNum = (s) => {
    if (!s) return null;
    const m = String(s).match(/\d[\d.,]*\d|\d/);
    if (!m) return null;
    let t = m[0];
    if (t.includes(",") && t.includes(".")) {
      const dec = t.lastIndexOf(",") > t.lastIndexOf(".") ? "," : ".";
      const tho = dec === "," ? "." : ",";
      t = t.split(tho).join("").replace(dec, ".");
    } else if (t.includes(",")) {
      const after = t.split(",").pop();
      t = t.split(",").join(after.length <= 2 ? "." : "");
    } else if (t.includes(".")) {
      const after = t.split(".").pop();
      if (after.length === 3 && t.replace(/\./g, "").length > 3) t = t.split(".").join("");
    }
    const n = parseFloat(t);
    return isNaN(n) ? null : n;
  };

  // --- characteristics tables ("Kenmerken") → label/value pairs -----------
  // Listing pages state the executive-summary facts in a definition list or
  // table. Harvest every label/value pair once, then look fields up by their
  // Dutch/English labels — far more reliable than free-text regexes.
  const pairs = [];
  for (const dl of document.querySelectorAll("dl")) {
    const dts = dl.querySelectorAll("dt");
    const dds = dl.querySelectorAll("dd");
    const n = Math.min(dts.length, dds.length);
    for (let i = 0; i < n; i++) pairs.push([dts[i].innerText.trim(), dds[i].innerText.trim()]);
  }
  for (const tr of document.querySelectorAll("tr")) {
    const cells = tr.querySelectorAll("th, td");
    if (cells.length >= 2) pairs.push([cells[0].innerText.trim(), cells[1].innerText.trim()]);
  }
  // Fallback for pages that render characteristics as plain stacked text:
  // a line that IS a known label, followed by its value on the next line.
  const lines = bodyText.split("\n").map((s) => s.trim()).filter(Boolean);
  const norm = (s) => s.toLowerCase().replace(/[:*]+$/, "").replace(/\s+/g, " ").trim();
  const findPair = (labels) => {
    for (const [k, v] of pairs) {
      const nk = norm(k);
      if (labels.some((l) => nk === l) && v) return [k.trim(), v.trim()];
    }
    for (let i = 0; i < lines.length - 1; i++) {
      if (labels.some((l) => norm(lines[i]) === l)) return [lines[i], lines[i + 1]];
    }
    return null;
  };
  const fieldValue = (...labels) => {
    const hit = findPair(labels);
    return hit ? hit[1] : null;
  };
  // Distances keep their label ("NS-station" + "800 m" → "NS-station 800 m").
  const fieldNote = (...labels) => {
    const hit = findPair(labels);
    if (!hit) return null;
    return /\d/.test(hit[1]) && hit[1].length < 40 ? `${hit[0].replace(/:$/, "")} ${hit[1]}` : hit[1];
  };

  // --- areas ------------------------------------------------------------
  // On funda in business the "Oppervlakte" row under Kenmerken is the space
  // being OFFERED ("5.773 m² (in units vanaf 280 m²)", echoed in the copy as
  // "Total available: 5,773 m² LFA") — not the size of the building. Treating
  // it as the total building area overstated every listing, so it feeds the
  // available figure; the total is only filled from a label that genuinely
  // means the whole building.
  const offeredRaw = fieldValue(
    "oppervlakte", "beschikbare oppervlakte", "beschikbaar oppervlakte", "vloeroppervlakte",
    "available surface", "available approx.", "available area", "surface", "floor area",
  );
  if (offeredRaw && /m²|m2/i.test(offeredRaw)) out.availableAreaSqm = parseNum(offeredRaw);

  const totalRaw = fieldValue(
    "totale oppervlakte", "totaal oppervlakte", "bruto vloeroppervlakte", "bvo",
    "total building area", "total surface", "gross floor area",
  );
  if (totalRaw && /m²|m2/i.test(totalRaw)) out.areaSqm = parseNum(totalRaw);

  // "Total available: 5,773 m² LFA" / "Totaal beschikbaar: …" in the prose,
  // when the characteristics table didn't state it.
  if (out.availableAreaSqm == null) {
    const tm = fullText.match(/tot(?:al|aal)\s*(?:available|beschikbaar)\s*:?\s*([\d.,]+)\s*(?:m²|m2)/i);
    if (tm) out.availableAreaSqm = parseNum(tm[1]);
  }
  if (out.availableAreaSqm == null) {
    const range = bodyText.match(/([\d.,]+)\s*(?:m2|m²)?\s*(?:tot|to|-|–|—)\s*([\d.,]+)\s*(?:m2|m²)/i);
    const single = bodyText.match(/([\d.,]+)\s*(?:m2|m²)/i);
    if (range) out.availableAreaSqm = parseNum(range[2]);
    else if (single) out.availableAreaSqm = parseNum(single[1]);
  }

  // --- smallest lettable unit ("in units vanaf 280 m²", "from 280 m² LFA") ---
  const divSource = (offeredRaw || "") + " " + fullText;
  const divMatch =
    divSource.match(/(?:in\s*units?\s*vanaf|units?\s*(?:from|vanaf)|deelbaar\s*(?:vanaf|per)|vanaf)\s*([\d.,]+)\s*(?:m²|m2)/i) ||
    divSource.match(/(?:part[- ]floor|deelverhuur)[^.]{0,40}?(?:from|vanaf)\s*([\d.,]+)\s*(?:m²|m2)/i);
  if (divMatch) {
    const d = parseNum(divMatch[1]);
    // Only meaningful if it's genuinely smaller than what's on offer.
    if (d != null && (out.availableAreaSqm == null || d < out.availableAreaSqm)) out.minDivisibleAreaSqm = d;
  }

  // --- availability / acceptance date ---
  // "Aanvaarding" is funda's label; a bare "beschikbaar" only counts when the
  // value is NOT an area (an area means it was the available-surface row).
  const acceptRaw = fieldValue("aanvaarding", "beschikbaar", "beschikbaar per", "beschikbaar vanaf", "availability", "available", "available from");
  if (acceptRaw && !/m²|m2/i.test(acceptRaw)) out.availability = acceptRaw;

  // --- parking ratio -----------------------------------------------------
  // Stated as a labelled row ("Parkeerratio 1 op 80 m²") or, more often, in
  // the description ("Parking ratio: 1 space per 348 m² LFA"). The unit that
  // follows matters to a tenant — 1:348 LFA is not 1:348 BVO — so it's kept.
  const RATIO_BODY_RE =
    /(?:parking\s*(?:ratio|norm)|parkeer(?:ratio|norm)|parkeerplaats(?:en)?\s*ratio)\s*[:\-–]?\s*(?:1|one|één|een)\s*(?:parkeer)?(?:plaats|plek|space|spot|spaces)?\s*(?:per|op|:|\/|to)\s*([\d.,]+)\s*(m²|m2|lfa|vvo|bvo|sq\.?\s?m)?[\s]*(lfa|vvo|bvo)?/i;
  const RATIO_PLAIN_RE =
    /(?:1|one|één|een)\s*(?:parkeerplaats|parkeerplek|parking\s*space|space)\s*(?:per|op|\/)\s*([\d.,]+)\s*(m²|m2|lfa|vvo|bvo)?[\s]*(lfa|vvo|bvo)?/i;

  const formatRatio = (m) => {
    const n = String(m[1]).replace(/[.,]$/, "");
    const unit = [m[2], m[3]].filter(Boolean).join(" ").trim();
    const pretty = unit ? ` ${unit.replace(/m2/i, "m²").replace(/\b(lfa|vvo|bvo)\b/i, (u) => u.toUpperCase())}` : "";
    return `1:${n}${pretty}`;
  };

  const ratioRaw = fieldValue("parkeerratio", "parking ratio", "parkeernorm", "parking norm");
  let ratioMatch = ratioRaw ? ratioRaw.match(/(?:1|one|één|een)\s*(?:parkeer)?(?:plaats|plek|space|spot)?\s*(?:per|op|:|\/)\s*([\d.,]+)\s*(m²|m2|lfa|vvo|bvo)?[\s]*(lfa|vvo|bvo)?/i) : null;
  if (ratioMatch) {
    out.parkingRatio = formatRatio(ratioMatch);
  } else if (ratioRaw) {
    out.parkingRatio = ratioRaw;
  } else {
    ratioMatch = fullText.match(RATIO_BODY_RE) || fullText.match(RATIO_PLAIN_RE);
    if (ratioMatch) out.parkingRatio = formatRatio(ratioMatch);
  }

  // --- rental price office (only per-m²-per-year figures; a lump-sum
  // monthly rent is a different quantity and must not land in €/m²/yr) ---
  const rentRaw = fieldValue("huurprijs", "huurprijs kantoorruimte", "rental price", "rent", "rent price");
  if (rentRaw && /m²|m2|vierkante meter/i.test(rentRaw)) out.rentEurPerM2Year = parseNum(rentRaw);

  // --- rental service charges (same per-m² rule) ---
  const scRaw = fieldValue("servicekosten", "service charges", "service costs", "servicekosten kantoorruimte");
  if (scRaw && /m²|m2|vierkante meter/i.test(scRaw)) out.serviceChargeEurPerM2Year = parseNum(scRaw);

  // --- rental price parking space (per space per year) ---
  const parkRaw = fieldValue("huurprijs parkeerplaats", "prijs parkeerplaats", "huurprijs per parkeerplaats", "parkeerplaats huurprijs", "rental price parking space", "parking price");
  if (parkRaw) {
    let price = parseNum(parkRaw);
    if (price != null && /maand|month/i.test(parkRaw)) price = Math.round(price * 12);
    out.parkingPriceEurYear = price;
  }

  // --- distances: airport / highway / public transport ---
  out.airportNote = fieldNote("luchthaven", "airport", "schiphol", "afstand tot luchthaven", "distance airport");
  if (!out.airportNote) {
    const am = fullText.match(/schiphol[^\S\n]*(?:op|:)?[^\S\n]*([\d.,]+\s*(?:km|m|min[a-z.]*))/i);
    if (am) out.airportNote = `Schiphol ${am[1]}`;
  }
  out.highwayNote = fieldNote("snelweg", "afrit", "afrit snelweg", "afstand tot snelweg", "highway", "motorway", "distance highway");
  if (!out.highwayNote) {
    const hm = fullText.match(/\b(A\d{1,3})\b[^\S\n]*(?:op|:)?[^\S\n]*([\d.,]+\s*(?:km|m)\b)/i);
    if (hm) out.highwayNote = `${hm[1].toUpperCase()} ${hm[2]}`;
  }
  out.publicTransportNote = fieldNote(
    "ns station", "ns-station", "treinstation", "station", "metrostation", "metro",
    "bushalte", "bus", "tramhalte", "tram", "openbaar vervoer", "ov",
    "public transport", "train station", "distance public transport",
  );

  // --- energy label (labeled value first, then a keyword-anchored match —
  // never a bare standalone-letter scan, which grabs random capitals) ---
  const enRaw = fieldValue("energielabel", "energy label", "energy rating", "energieklasse");
  if (enRaw) {
    const em = enRaw.toUpperCase().match(/([A-G])(\+{0,5})/);
    if (em) out.energyLabel = em[1] + em[2];
  } else {
    const em = fullText.match(/energ(?:ielabel|y\s*(?:label|rating))\s*:?\s*([A-Ga-g])(\+{0,5})/i);
    if (em) out.energyLabel = em[1].toUpperCase() + em[2];
  }

  // --- year built (labeled value first, then any plausible year) ---
  const yrRaw = fieldValue("bouwjaar", "year of construction", "construction year", "year built", "bouwperiode");
  const yrSrc = yrRaw || bodyText;
  const yr = String(yrSrc).match(/\b(1[89]\d{2}|20\d{2})\b/);
  if (yr) out.yearBuilt = parseInt(yr[1], 10);

  // --- subarea (breadcrumb: Home > City > Subarea > Listing) ---
  for (const b of document.querySelectorAll('script[type="application/ld+json"]')) {
    let data;
    try { data = JSON.parse(b.textContent); } catch (e) { continue; }
    const arr = Array.isArray(data) ? data : (data["@graph"] ? data["@graph"] : [data]);
    for (const o of arr) {
      if (!o || o["@type"] !== "BreadcrumbList" || !Array.isArray(o.itemListElement)) continue;
      const names = o.itemListElement
        .map((it) => (it && (it.name || (it.item && it.item.name))) || null)
        .filter(Boolean);
      // Last crumb is the listing itself; the one before it is the subarea.
      if (names.length >= 2) out.subarea = String(names[names.length - 2]);
    }
  }
  if (!out.subarea) {
    const crumbs = document.querySelectorAll(
      'nav[aria-label*="readcrumb"] a, nav[aria-label*="ruimte"] a, ol[class*="breadcrumb"] a, ul[class*="breadcrumb"] a',
    );
    if (crumbs.length >= 2) out.subarea = crumbs[crumbs.length - 1].innerText.trim();
  }

  // --- address (from JSON-LD gaps, then title/heading) ---
  if (!out.street || !out.city) {
    // Strip the marketing tail before mining the title, or the city ends up
    // as "Amsterdam - Kantoor te huur" (the postcode sits before the tail,
    // so cutting it is safe).
    const src = (out.name || document.title || bodyText.slice(0, 200))
      .split(/\s+[|\u2013\u2014\u00b7]\s+|\s+-\s+/)[0]
      .trim();
    const pc = src.match(/\b(\d{4})\s?([A-Za-z]{2})\b/);
    if (pc && !out.postalCode) out.postalCode = pc[1] + " " + pc[2].toUpperCase();
    // Number part tolerates unit suffixes like "20-H2" / "12 B" / "600a".
    const sh = src.match(/([A-Za-zÀ-ÿ.\-'\s]+?)\s+(\d+(?:[\s-]?[A-Za-z]\d*)?)\b/);
    if (sh) {
      out.street = out.street || sh[1].trim();
      out.houseNumber = out.houseNumber || sh[2].replace(/\s+/g, "").toUpperCase();
    }
    if (pc && !out.city) {
      const tail = src.slice(src.indexOf(pc[0]) + pc[0].length).replace(/^[\s,–-]+/, "");
      if (tail) out.city = tail.split(",")[0].trim();
    }
  }
  if (out.street) {
    const line1 = [out.street, out.houseNumber].filter(Boolean).join(" ");
    const line2 = [out.postalCode, out.city].filter(Boolean).join(" ");
    out.address = [line1, line2].filter((s) => s && s.trim()).join(", ");
  }

  // The page title carries marketing tails ("… - Kantoor te huur", "… | Funda
  // in Business") and usually repeats the full address. Trim it down to the
  // building's own name so the library and the client PDF read cleanly — done
  // AFTER the address block above, which mines the untrimmed title for the
  // postcode and city.
  if (out.name) {
    let n = out.name.split(/\s+[|\u2013\u2014\u00b7]\s+|\s+-\s+/)[0].trim();
    // "Herengracht 500, 1017 CB Amsterdam" → "Herengracht 500", but a real
    // building name without a number ("The Edge") is left alone.
    if (n.includes(",") && /\d/.test(n.split(",")[0])) n = n.split(",")[0].trim();
    if (n) out.name = n;
  }

  // --- amenities ---------------------------------------------------------
  // Canonical label ← any of its NL/EN spellings, so "Bicycle parking for
  // approx. 800 bicycles" and "fietsenstalling" both land as one tidy
  // "Bicycle storage" rather than being missed or duplicated.
  const AMENITIES = [
    ["Roof terrace", ["roof terrace", "dakterras", "roof garden"]],
    ["Terrace", ["terrace", "terras"]],
    ["Bicycle storage", ["bicycle storage", "bicycle parking", "fietsenstalling", "fietsparkeren", "bike storage"]],
    ["24/7 access", ["24/7 access", "24/7 toegang", "24-hour access"]],
    ["Restaurant", ["restaurant", "eatery"]],
    ["Bar", ["bars", " bar ", "café", "cafe"]],
    ["Coffee bar", ["coffee bar", "koffiebar", "barista"]],
    ["Gym", ["gym", "fitness", "sportschool"]],
    ["Supermarket", ["supermarket", "supermarkt"]],
    ["Cinema", ["cinema", "bioscoop"]],
    ["Parking", ["parking", "parkeren", "parkeerplaats", "car park", "parkeergarage"]],
    ["Underground parking", ["underground car park", "underground parking", "parkeerkelder", "ondergrondse parkeer"]],
    ["EV charging", ["charging point", "charging station", "laadpunt", "laadpalen", "ev charging", "electric vehicle charging"]],
    ["Air conditioning", ["air conditioning", "airconditioning", "klimaatbeheersing", "koeling"]],
    ["Meeting rooms", ["meeting room", "vergaderruimte", "vergaderzaal", "conference room"]],
    ["Auditorium", ["auditorium", "theater", "theatre"]],
    ["Furnished", ["furnished", "gemeubileerd", "turn-key", "turnkey"]],
    ["Lifts", ["lift core", "lift cores", "elevator", "passagierslift", "liften"]],
    ["Showers", ["shower", "douche"]],
    ["Reception", ["reception", "receptie", "concierge", "host"]],
    ["Catering", ["catering", "kantine", "bedrijfsrestaurant"]],
    ["Solar panels", ["solar panel", "zonnepanelen"]],
    ["Sustainability certified", ["breeam", "well platinum", "well gold", "leed", "paris proof", "net carbon zero"]],
  ];
  const low = fullText.toLowerCase();
  out.amenities = AMENITIES.filter(([, keys]) => keys.some((k) => low.includes(k))).map(([label]) => label);
  // "Underground parking" already implies parking — don't list both.
  if (out.amenities.includes("Underground parking")) {
    out.amenities = out.amenities.filter((a) => a !== "Parking");
  }

  // --- images -----------------------------------------------------------
  // The page states its own photo count ("Foto's 15"); read it up front so
  // the scan below can stop early instead of walking every image reference
  // in a multi-megabyte page (a real listing embeds thousands).
  const photoCountMatch = bodyText.match(/foto['\u2019\u02bc]?s?\s*(\d{1,3})/i);
  out.photoTarget = photoCountMatch ? parseInt(photoCountMatch[1], 10) : 0;
  const PHOTO_SCAN_LIMIT = Math.max((out.photoTarget || 0) * 4, 60);

  const SKIP = ["logo", "icon", "sprite", "avatar", "pixel", "placeholder", "spinner", "loading"];
  const seen = new Set(out.photos);
  const addPhoto = (raw) => {
    if (!raw) return;
    // Absolute URLs are the overwhelming majority — skip the (costly) URL
    // constructor for them, and lowercase once rather than per skip-word.
    const absolute = raw.charCodeAt(0) === 104 /* h */ && /^https?:\/\//.test(raw);
    if (!absolute && raw.charCodeAt(0) !== 47 /* / */) return;
    const low = raw.toLowerCase();
    for (let i = 0; i < SKIP.length; i++) if (low.indexOf(SKIP[i]) !== -1) return;
    let u = raw;
    if (!absolute) {
      try { u = new URL(raw, location.href).href; } catch (e) { return; }
    }
    if (!seen.has(u)) { seen.add(u); out.photos.push(u); }
  };
  const pushSrcset = (value, sink) => {
    if (!value) return;
    for (const part of value.split(",")) {
      const url = part.trim().split(/\s+/)[0];
      if (url) sink.push(url);
    }
  };

  // Pass 0 — funda's own media CDN, scoped to this listing. Every funda
  // gallery photo is served from cloud.funda.nl/valentina_media/, and
  // nothing else on the page is — so on a funda page this is a strictly
  // more precise source than the broad scans below: an <img> for
  // "Vergelijkbare panden" (recommended listings) or the broker's portrait
  // sits inside a link to a DIFFERENT object- id or to /makelaar/, which
  // this excludes by walking up to the image's closest <a href>. A live DOM
  // query, so it also picks up the full-size photos that only exist once
  // "Alle media" is opened. Non-funda sites (or a funda page that's moved
  // off this CDN) simply match nothing here and fall through to Pass 1/2
  // below unaffected.
  const FUNDA_CDN_RE = /^https:\/\/cloud\.funda\.nl\/valentina_media\//;
  const currentObjectId = (location.pathname.match(/\/object-(\d+)/) || [])[1] || null;
  const beforeFundaPass = out.photos.length;
  for (const img of document.querySelectorAll("img")) {
    // Cheap string tests first — closest("a[href]") walks the ancestor
    // chain, so it must only run for images that already look like a funda
    // gallery photo, not for every <img> on the page (most pages have many
    // that never match; walking up from each one is real, avoidable cost).
    const srcCandidates = [img.currentSrc || null, img.getAttribute("src"), img.getAttribute("data-src")];
    pushSrcset(img.getAttribute("srcset") || img.getAttribute("data-srcset"), srcCandidates);
    const matches = srcCandidates.filter((c) => c && FUNDA_CDN_RE.test(c));
    if (matches.length === 0) continue;

    const parentLink = img.closest("a[href]");
    if (parentLink) {
      const href = parentLink.getAttribute("href") || "";
      const otherObjectId = (href.match(/\/object-(\d+)/) || [])[1] || null;
      if (href.includes("/makelaar/") || (otherObjectId && otherObjectId !== currentObjectId)) continue;
    }
    for (const c of matches) addPhoto(c);
  }

  // Pass 1/2 only run when Pass 0 found nothing of its own — i.e. this isn't
  // a funda page. On a page where Pass 0 did find photos, running these too
  // would just reintroduce the noise Pass 0 was built to exclude.
  if (out.photos.length === beforeFundaPass) {
    // Pass 1 — regex over the page's own HTML source. Listing pages embed the
    // gallery in inline JSON/app state (before the lazy <img> tags swap in
    // their real src), so the full list is usually in the markup already. The
    // JSON escapes slashes as "\/" AND, in Next.js-style payloads, as
    // "\u002F"; HTML attributes escape "&" as "&amp;". All three have to be
    // unescaped or the URLs come out broken (or unmatched entirely).
    const html = document.documentElement.outerHTML
      .replace(/\\\//g, "/")
      .replace(/\\u002[fF]/g, "/")
      .replace(/&amp;/g, "&");
    const IMG_URL_RE = /https?:\/\/[^"'\s)\\<>]+\.(?:jpe?g|png|webp|avif)(?:\?[^"'\s)\\<>]*)?/gi;
    let m;
    while ((m = IMG_URL_RE.exec(html)) !== null) {
      addPhoto(m[0]);
      if (out.photos.length >= PHOTO_SCAN_LIMIT) break;
    }

    // Pass 2 — the rendered DOM. Always run it (not just as a fallback): when
    // the gallery/"Alle media" view is open, the full-size photos exist as real
    // elements even though they never appeared in the served HTML.
    const candidates = [];
    for (const img of document.querySelectorAll("img")) {
      candidates.push(img.getAttribute("src"), img.currentSrc || null);
      for (const attr of img.attributes) {
        // data-src, data-lazy-src, data-original, data-large, data-zoom-image…
        if (attr.name.startsWith("data-") && /\.(?:jpe?g|png|webp|avif)/i.test(attr.value)) {
          candidates.push(attr.value);
        }
      }
      pushSrcset(img.getAttribute("srcset") || img.getAttribute("data-srcset"), candidates);
    }
    for (const source of document.querySelectorAll("source")) {
      pushSrcset(source.getAttribute("srcset") || source.getAttribute("data-srcset"), candidates);
    }
    for (const anchor of document.querySelectorAll('a[href*=".jpg"], a[href*=".jpeg"], a[href*=".png"], a[href*=".webp"]')) {
      candidates.push(anchor.getAttribute("href"));
    }
    // Galleries built from CSS background images.
    for (const node of document.querySelectorAll('[style*="background"]')) {
      const bg = node.getAttribute("style") || "";
      const bm = bg.match(/url\((['"]?)(.*?)\1\)/i);
      if (bm && /\.(?:jpe?g|png|webp|avif)/i.test(bm[2])) candidates.push(bm[2]);
    }
    for (const c of candidates) addPhoto(c);
  }

  // --- collapse size/resolution variants + drop non-listing images -------
  // A single photo is usually served at several sizes (thumbnail + full, or
  // ?w=320 / ?w=1600), which is why a raw scan over-counts massively. Collapse
  // by a size-agnostic key so each real photo is kept once, preferring the
  // largest-looking variant. Also drop obvious non-listing images (agent
  // portraits, brand logos) by keyword.
  const EXTRA_SKIP = ["makelaar", "portret", "portrait", "headshot", "medewerker", "employee", "team-", "brand"];
  // Reduce a URL to an identity for the underlying photo, so the same image
  // served at another size, in another format, over another scheme or with
  // different cache params collapses to one entry. Order matters: the
  // extension comes off first, so that stripping "_1440x960" leaves a
  // trailing separator at the END of the string where it can be trimmed —
  // otherwise "123_1440x960.jpg" and "123.jpg" keep different keys.
  const sizeAgnostic = (u) => {
    let s = u.toLowerCase().split("?")[0].split("#")[0];
    s = s.replace(/^https?:\/\//, "");
    s = s.replace(/\.(?:jpe?g|png|webp|avif)$/, "");
    s = s.replace(/\d{2,4}x\d{2,4}/g, "");
    s = s.replace(/[-_/](?:thumbnails?|thumbs?|small|medium|large|preview|mini|orig(?:inal)?|full|xs|sm|md|lg|xl)\b/g, "");
    s = s.replace(/[-_](?:w|h)\d{2,4}\b/g, "");
    s = s.replace(/[-_]{2,}/g, "-");
    return s.replace(/[-_./]+$/, "");
  };
  const dim = (u) => { const m = u.match(/(\d{2,4})x(\d{2,4})/); return m ? Number(m[1]) * Number(m[2]) : 0; };
  const thumbish = (u) => (/(thumb|small|preview|mini)/i.test(u) ? 1 : 0);
  const looksLarger = (a, b) =>
    thumbish(a) !== thumbish(b) ? thumbish(a) < thumbish(b) : dim(a) >= dim(b);

  const byKey = new Map();
  for (let u of out.photos) {
    if (u.charCodeAt(0) !== 104 /* h */) {
      try { u = new URL(u, location.href).href; } catch (e) { continue; }
    }
    const low = u.toLowerCase();
    let skip = false;
    for (let i = 0; i < EXTRA_SKIP.length; i++) if (low.indexOf(EXTRA_SKIP[i]) !== -1) { skip = true; break; }
    if (skip) continue;
    const key = sizeAgnostic(low);
    const prev = byKey.get(key);
    if (!prev || looksLarger(u, prev)) byKey.set(key, u);
  }
  out.photos = [...byKey.values()];

  // --- cap to the listing's own photo count ------------------------------
  // The page states its real photo count ("Foto's 11"). A whole-page scan
  // also picks up images that live BELOW the gallery — the agent portrait,
  // the brand logo, and other buildings under "Onderdeel van …". Those come
  // AFTER the listing's own gallery in source order, so keeping just the
  // first N (N = the stated count) drops them and leaves the real photos.
  if (out.photoTarget > 0 && out.photos.length > out.photoTarget) {
    out.photos = out.photos.slice(0, out.photoTarget);
  }

  return out;
}

// ---- popup wiring ---------------------------------------------------------
// Everything expensive (injecting into the tab, reading the page, building
// the handoff URL) runs the moment the popup OPENS, not when the button is
// clicked. Opening the popup is already a deliberate act with a natural pause
// after it, so that pause absorbs the work — and the click itself then has
// nothing left to do but open the tab, which is instant.
const statusEl = document.getElementById("status");
const previewEl = document.getElementById("preview");
const captureBtn = document.getElementById("capture");

let readyUrl = null;      // handoff URL, built as soon as the page is read
let capturePromise = null; // in flight while the popup is opening

function setStatus(kind, text) {
  statusEl.className = kind;
  statusEl.textContent = text;
}

function renderPreview(data, photoCount, droppedPhotos) {
  const target = data.photoTarget || 0;
  const photosLabel = target ? `${photoCount} (page says ${target})` : photoCount;
  const fields = [
    ["Name", data.name], ["Address", data.address], ["City", data.city],
    ["Subarea", data.subarea],
    ["Available m²", data.availableAreaSqm], ["Min. unit m²", data.minDivisibleAreaSqm],
    ["Total building m²", data.areaSqm],
    ["Amenities", (data.amenities || []).join(", ")],
    ["Parking ratio", data.parkingRatio],
    ["Rent €/m²/yr", data.rentEurPerM2Year], ["Service €/m²/yr", data.serviceChargeEurPerM2Year],
    ["Parking €/yr", data.parkingPriceEurYear],
    ["Available", data.availability],
    ["Energy", data.energyLabel], ["Year built", data.yearBuilt],
    ["Airport", data.airportNote], ["Highway", data.highwayNote],
    ["Public transport", data.publicTransportNote],
    ["Photos", photosLabel + (droppedPhotos ? ` · ${droppedPhotos} dropped (link length)` : "")],
  ];
  previewEl.replaceChildren();
  for (const [k, v] of fields) {
    const div = document.createElement("div");
    const key = document.createElement("span");
    key.className = "k";
    key.textContent = k;
    const val = document.createElement("span");
    val.className = "v";
    val.textContent = v == null || v === "" ? "—" : String(v);
    div.append(key, val);
    previewEl.appendChild(div);
  }
}

function buildHandoffUrl(appUrl, data) {
  const p = new URLSearchParams();
  const set = (k, v) => {
    if (v !== null && v !== undefined && String(v).trim() !== "") p.set(k, String(v));
  };
  set("name", data.name);
  set("address", data.address);
  set("postalCode", data.postalCode);
  set("city", data.city);
  set("energyLabel", data.energyLabel);
  set("yearBuilt", data.yearBuilt);
  set("totalBuildingAreaM2", data.areaSqm);
  set("buildingAmenities", (data.amenities || []).join(", "));
  set("description", data.description);
  set("photos", (data.photos || []).join(","));
  // Executive summary
  set("submarket", data.subarea);
  set("availableAreaM2", data.availableAreaSqm);
  set("minDivisibleAreaM2", data.minDivisibleAreaSqm);
  set("parkingRatio", data.parkingRatio);
  set("rentEurPerM2Year", data.rentEurPerM2Year);
  set("serviceChargeEurPerM2Year", data.serviceChargeEurPerM2Year);
  set("parkingPriceEurYear", data.parkingPriceEurYear);
  set("availability", data.availability);
  set("airportNote", data.airportNote);
  set("accessibilityNote", data.highwayNote);
  set("publicTransportNote", data.publicTransportNote);

  const base = appUrl + "/buildings/new?";
  let photos = (data.photos || []).slice();
  let dropped = 0;
  while (photos.length && (base + p.toString()).length > MAX_HANDOFF_URL_LENGTH) {
    photos.pop();
    dropped += 1;
    p.set("photos", photos.join(","));
  }
  if (!photos.length) p.delete("photos");
  return { url: base + p.toString(), photoCount: photos.length, dropped };
}

// A page that's still hydrating (or one the extraction walk turns out to be
// pathologically slow on) must not leave the popup stuck on "Reading this
// page…" forever with no way out — that reads as "nothing happens" exactly
// like a real failure would, just slower. Bounding it means every path ends
// in either a result or a visible error within a few seconds.
const READ_TIMEOUT_MS = 8000;

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function readPage() {
  const startedAt = performance.now();
  const [tab] = await withTimeout(
    chrome.tabs.query({ active: true, currentWindow: true }),
    READ_TIMEOUT_MS,
    "Timed out finding the active tab — try again.",
  );
  if (!tab) throw new Error("No active tab to read.");
  // tab.url is only present once activeTab is granted; only reject when it is
  // present AND clearly not a web page.
  if (tab.url && !/^https?:/i.test(tab.url)) {
    throw new Error("This isn't a web page — open a listing first.");
  }
  const results = await withTimeout(
    chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractListing }),
    READ_TIMEOUT_MS,
    "Timed out reading this page — it may still be loading. Try again in a moment.",
  );
  const data = results && results[0] && results[0].result;
  if (!data) throw new Error("Nothing could be read from this page.");
  return { data, ms: Math.round(performance.now() - startedAt) };
}

async function prepare() {
  setStatus("", "Reading this page…");
  captureBtn.disabled = true;
  const [{ data, ms }, appUrl] = await Promise.all([readPage(), getAppUrl()]);

  if (data.blocked) {
    setStatus("warn", "This looks like a verification page — open the real listing, then reopen this popup.");
    return null;
  }

  const { url, photoCount, dropped } = buildHandoffUrl(appUrl, data);
  readyUrl = url;
  captureBtn.disabled = false;

  // Only what the browser has actually loaded can be read. A listing page
  // ships a handful of gallery images and fetches the rest when you open
  // "Alle media", so say plainly when the page is holding fewer than it
  // advertises rather than quietly capturing five of thirty-seven.
  const target = data.photoTarget || 0;
  const short = target && photoCount < target;
  let note = `Ready in ${ms} ms — ${photoCount} photo${photoCount === 1 ? "" : "s"}`;
  if (short) {
    note += ` of ${target} on this page. Open “Alle media” on the listing, then reopen this popup to pick up the rest.`;
  } else {
    note += ". Click to send it to your library.";
  }
  if (dropped) note += ` (${dropped} left out to keep the link short enough.)`;
  setStatus(short ? "warn" : "ok", note);
  renderPreview(data, photoCount, dropped);
  return url;
}

capturePromise = prepare().catch((e) => {
  setStatus("err", e.message || String(e));
  captureBtn.disabled = false; // let them retry
  return null;
});

captureBtn.addEventListener("click", async () => {
  // Normally already resolved, so this is a no-op and the tab opens at once.
  // Every branch below must end in either a url or a visible status — a
  // click that just does nothing is indistinguishable from the extension
  // being broken, even when the real cause was already shown and missed.
  let url = readyUrl;
  if (!url) {
    try {
      url = await capturePromise;
    } catch (e) {
      url = null;
    }
  }
  if (!url) {
    url = await prepare().catch((e) => {
      setStatus("err", (e && e.message) || "Could not read this page. Try reopening the popup.");
      return null;
    });
  }
  if (!url) {
    captureBtn.disabled = false;
    return;
  }
  try {
    await chrome.tabs.create({ url });
    window.close(); // nothing left to look at — get out of the way
  } catch (e) {
    setStatus("err", "Could not open the app — check the address under Settings. (" + e.message + ")");
  }
});

// ---- settings ------------------------------------------------------------
const appUrlInput = document.getElementById("app-url");
const saveBtn = document.getElementById("save");

getAppUrl().then((url) => {
  appUrlInput.value = url;
  // Start DNS + TLS to the app now, so the tab we open later doesn't pay for
  // it. Resource hints need no host permission.
  for (const rel of ["preconnect", "dns-prefetch"]) {
    const link = document.createElement("link");
    link.rel = rel;
    link.href = url;
    document.head.appendChild(link);
  }
});

saveBtn.addEventListener("click", async () => {
  const raw = appUrlInput.value.trim();
  let origin;
  try {
    origin = new URL(raw).origin;
  } catch {
    statusEl.className = "err";
    statusEl.textContent = "That isn't a valid address — include https://, e.g. https://your-app.up.railway.app";
    return;
  }
  await chrome.storage.local.set({ appUrl: origin });
  appUrlInput.value = origin;
  statusEl.className = "ok";
  statusEl.textContent = "Saved. Captures will open " + origin + ".";
});
