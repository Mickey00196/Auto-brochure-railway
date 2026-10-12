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
    delivery: null, floors: null, sourceUrl: null, contractTerm: null,
    // The sentence each parking figure was read from, so the broker can
    // check the normalized number against what the listing actually says.
    parkingRatioRaw: null, parkingPriceRaw: null,
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
  // Labels are tried in the order given, so the most specific one wins: a
  // stacked "Status / Beschikbaar / Aanvaarding / In overleg" must answer
  // "aanvaarding" with "In overleg", not "beschikbaar" with "Aanvaarding".
  // A value line that is itself a short sub-heading ("Huurprijs" /
  // "Kantoorruimte:" / "€ 355,00 per m² per jaar") hands over to the line
  // after it.
  const findPair = (labels) => {
    for (const l of labels) {
      for (const [k, v] of pairs) {
        if (norm(k) === l && v) return [k.trim(), v.trim()];
      }
    }
    for (const l of labels) {
      for (let i = 0; i < lines.length - 1; i++) {
        if (norm(lines[i]) !== l) continue;
        const v = lines[i + 1];
        if (/:$/.test(v) && v.length <= 40 && !/\d/.test(v) && i + 2 < lines.length) {
          return [`${lines[i]} ${v}`, lines[i + 2]];
        }
        return [lines[i], v];
      }
    }
    return null;
  };
  const fieldValue = (...labels) => {
    const hit = findPair(labels);
    return hit ? hit[1] : null;
  };
  // Distances keep their label ("NS-station" + "800 m" → "NS-station 800 m").
  // A note field exists to carry a distance — a matched value with no digit
  // in it at all (e.g. "In de omgeving" rendering "Bushalte" as a bare tag,
  // not a labeled "Bushalte 200 m" row) isn't a distance and must not be
  // returned as one; better an honest blank than a category word standing
  // in for a figure it never carried (§24).
  // Only a short value that IS a distance counts: a heading such as
  // "Openbaar vervoer" followed by a whole paragraph about bus lines is
  // description, not a distance, and is left to the capture page, which
  // works the distances out from the address itself.
  const DISTANCE_RE = /\d[\d.,]*\s*(?:km|kilometer|m|meter|min(?:uten|utes|\.)?)\b/i;
  const fieldNote = (...labels) => {
    const hit = findPair(labels);
    if (!hit || hit[1].length > 40 || !DISTANCE_RE.test(hit[1])) return null;
    return `${hit[0].replace(/:$/, "")} ${hit[1]}`;
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
  // Last resort: the first m² figure on the page. Flagged, because the
  // per-floor list below is a far better source when it exists.
  let areaFromLooseScan = false;
  if (out.availableAreaSqm == null) {
    areaFromLooseScan = true;
    const range = bodyText.match(/([\d.,]+)\s*(?:m2|m²)?\s*(?:tot|to|-|–|—)\s*([\d.,]+)\s*(?:m2|m²)/i);
    const single = bodyText.match(/([\d.,]+)\s*(?:m2|m²)/i);
    if (range) out.availableAreaSqm = parseNum(range[2]);
    else if (single) out.availableAreaSqm = parseNum(single[1]);
    else areaFromLooseScan = false;
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
  const acceptRaw = fieldValue(
    "aanvaarding", "huuringangsdatum", "ingangsdatum", "beschikbaar per", "beschikbaar vanaf", "beschikbaarheid",
    "availability", "available from", "start date", "beschikbaar", "available",
  );
  if (acceptRaw && !/m²|m2/i.test(acceptRaw)) out.availability = acceptRaw;

  // --- lease term ("Huurtermijn: 5 (vijf) jaar...") — labelled only, same
  // as "Available from" above: a loose "N jaar" scan over the whole page
  // would just as easily catch a building's age or an energy certificate's
  // validity period, so this only fills in when the listing states it
  // under a clear lease-term label. ---
  out.contractTerm = fieldValue("huurtermijn", "lease term", "contract term", "rental term", "lease period", "huurperiode");

  // --- parking ratio → "1:N" --------------------------------------------
  // Every phrasing is normalized to one number: how many m² per parking
  // space. "Parkeernorm: 1 parkeerplaats per 250 m² kantoorruimte",
  // "1 pp per 250 m² VVO", "parkeernorm van 1 op 250", "1/250", "1:250" all
  // become "1:250"; "4 parkeerplaatsen per 1.000 m²" becomes 1:250 too (an
  // exact division, not an estimate). The sentence it came from is kept in
  // parkingRatioRaw. Only text that talks about parking is searched — a
  // floor plan's "schaal 1:100" must never become a parking ratio.
  const textLines = [];
  {
    const seen = new Set();
    for (const raw of fullText.split("\n")) {
      const t = raw.replace(/\s+/g, " ").trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      textLines.push(t);
    }
  }
  const clip = (s) => (s.length > 220 ? s.slice(0, 217) + "…" : s);
  // The one sentence of a paragraph that holds the figure, for the raw text.
  const sentenceWith = (t, test) =>
    t.split(/(?<=[.;!?])\s+(?=[A-Z€•\-])/).find((part) => test(part)) || t;
  const PARKING_CTX = /parkeer|parkeren|parking|\bp\.?p\.?\b|garage|auto'?s?\b|\bcars?\b/i;
  const parseRatio = (s) => {
    if (!s) return null;
    let m = s.match(
      /(?:^|[^\d.,a-z])(?:1|één|een|one)\s*(?:p\.?p\.?|parkeer(?:plaats|plek)(?:en|ken)?|plaats(?:en)?|plek(?:ken)?|(?:parking\s*)?(?:spaces?|spots?|lots?|bays?)|auto)?\s*(?:per|op|:|\/|to|for\s*every|every|voor\s*(?:elke|iedere))\s*(?:elke\s*|iedere\s*)?(\d[\d.,]*)/i,
    );
    let denom = m ? parseNum(m[1]) : null;
    if (denom == null) {
      // "N spaces per 100 m²" / "0,4 pp per 100 m²"
      m = s.match(
        /(\d[\d.,]*)\s*(?:p\.?p\.?|parkeer(?:plaats|plek)(?:en|ken)?|plaatsen|plekken|(?:parking\s*)?spaces)\s*(?:per|op|\/|for\s*every)\s*(\d[\d.,]*)\s*(?:m²|m2|sq)/i,
      );
      if (m) {
        const n = parseNum(m[1]);
        const a = parseNum(m[2]);
        if (n && a) denom = a / n;
      }
    }
    if (denom == null || denom < 10 || denom > 2000) return null;
    return Math.round(denom);
  };
  const ratioLabelRaw = fieldValue("parkeerratio", "parking ratio", "parkeernorm", "parking norm", "parkeernormering");
  let ratioDenom = parseRatio(ratioLabelRaw);
  if (ratioDenom != null) out.parkingRatioRaw = clip(ratioLabelRaw);
  if (ratioDenom == null) {
    // Lines naming the ratio itself first, then any line about parking.
    // A heading line ("Parkeernorm:") is read together with the line
    // under it.
    const NORM_KW = /parkeer(?:norm|ratio)|parking\s*(?:ratio|norm)|\bnorm\b|ratio/i;
    const tiers = [
      textLines.map((t, i) => [t, i]).filter(([t]) => NORM_KW.test(t)),
      textLines.map((t, i) => [t, i]).filter(([t]) => PARKING_CTX.test(t) && !NORM_KW.test(t)),
    ];
    outer: for (const tier of tiers) {
      for (const [t, i] of tier) {
        const withNext = t.length <= 40 && i + 1 < textLines.length ? `${t} ${textLines[i + 1]}` : t;
        const d = parseRatio(t) ?? parseRatio(withNext);
        if (d != null) {
          ratioDenom = d;
          out.parkingRatioRaw = clip(parseRatio(t) != null ? sentenceWith(t, (x) => parseRatio(x) != null) : withNext);
          break outer;
        }
      }
    }
  }
  if (ratioDenom != null) out.parkingRatio = `1:${ratioDenom}`;
  else if (ratioLabelRaw) out.parkingRatioRaw = clip(ratioLabelRaw); // shown for checking, never guessed at

  // --- rental price office: a stated per-m²-per-year figure is used as-is.
  // Some listings (funda in business small units especially) price the
  // whole space as a flat lump sum instead — "€ 5.200 per maand" for the
  // 481 m² on offer, never a rate at all. That's not a different quantity
  // to discard, just a total that needs dividing by the area it prices (the
  // area ON OFFER, never the whole building) and annualizing if it's
  // monthly — an exact unit conversion, not a guess, so it's safe to do
  // automatically. Same "maand"/"month" check already used for the parking
  // price below; no explicit monthly marker is taken to mean the total was
  // already annual.
  const toPerM2PerYear = (raw, area) => {
    if (!raw || area == null || area <= 0) return null;
    const amount = parseNum(raw);
    if (amount == null) return null;
    const annual = /maand|\bmnd\b|month|\bmo\b|p\.?\s*m\.?\b/i.test(raw) ? amount * 12 : amount;
    return Math.round(annual / area);
  };

  const rentRaw = fieldValue("huurprijs", "huurprijs kantoorruimte", "rental price", "rent", "rent price");
  out.rentEurPerM2Year =
    rentRaw && /m²|m2|vierkante meter/i.test(rentRaw) ? parseNum(rentRaw) : toPerM2PerYear(rentRaw, out.availableAreaSqm);

  // --- rental service charges (same per-m² rule and lump-sum fallback) ---
  // funda's characteristics row often says "Geen servicekosten bekend" while
  // the description states the figure ("De servicekosten bedragen circa € 61
  // per m² v.v.o. per jaar"). A row without a number is no answer, so the
  // description is read next: a sentence that names the service charges and
  // states an amount after that word, or the line under a "Servicekosten"
  // heading. "Huurprijs exclusief servicekosten: € 195" is the rent, not the
  // service charge, and is skipped.
  const SC_KW = /servicekosten|service\s*(?:charges?|costs?)/i;
  const SC_NOT = /(?:excl(?:\.|usief|uding|usive)?|incl(?:\.|usief|uding|usive)?|plus|vermeerderd\s*met)\s*(?:de\s*|the\s*)?(?:servicekosten|service\s*(?:charges?|costs?))/i;
  const amountFrom = (s) => {
    const m = s.match(/(?:€|eur(?:o)?\b)\s*\d[\d.,]*/i);
    if (!m) return null;
    const rest = s.slice(m.index);
    return m[0] + rest.slice(m[0].length).split("€")[0];
  };
  const scFromProse = () => {
    for (let i = 0; i < textLines.length; i++) {
      const t = textLines[i];
      if (!SC_KW.test(t)) continue;
      if (t.length <= 40 && /^[^€\d]*(?:servicekosten|service\s*(?:charges?|costs?))[^€\d]*$/i.test(t)) {
        const next = textLines[i + 1];
        if (next && !SC_KW.test(next)) {
          const a = amountFrom(next);
          if (a) return a;
        }
        continue;
      }
      for (const sentence of t.split(/(?<=[.;!?])\s+(?=[A-Z€•\-])/)) {
        if (SC_NOT.test(sentence)) continue;
        const kw = sentence.search(SC_KW);
        if (kw < 0) continue;
        const a = amountFrom(sentence.slice(kw));
        if (a) return a;
      }
    }
    return null;
  };
  const scLabelRaw = fieldValue("servicekosten", "service charges", "service costs", "servicekosten kantoorruimte");
  const scRaw = scLabelRaw && /\d/.test(scLabelRaw) ? scLabelRaw : scFromProse();
  out.serviceChargeEurPerM2Year =
    scRaw && /m²|m2|vierkante meter/i.test(scRaw) ? parseNum(scRaw) : toPerM2PerYear(scRaw, out.availableAreaSqm);

  // --- rental price parking space → € per space per year ------------------
  // Read from a labelled row when there is one, otherwise from any line
  // about parking ("Huurprijs parkeerplaats: € 3.700,36 per plaats per jaar",
  // "€ 3.500 per parkeerplaats per jaar", "€ 150 p/m per plek"), or a line
  // just under a parking heading. A monthly figure is multiplied by 12 in
  // code; the line it came from is kept in parkingPriceRaw. With several
  // tiers (office hours vs 24/7) the first one stated wins. Amounts that are
  // a rate per m² are never a parking price.
  const YEAR_RE = /per\s*(?:jaar|annum|year|jr)|\bp\.?\s*\/?\s*j\.?(?![a-z])|\/\s*(?:jaar|jr|year|yr)\b|jaarlijks|annually|yearly|per\s*plaats\s*per\s*jaar/i;
  const MONTH_RE = /per\s*(?:maand|mnd|month)|\bp\.?\s*\/?\s*m\.?(?![a-z²2])|\/\s*(?:maand|mnd|mo|month)\b|maandelijks|monthly/i;
  const parsePrice = (s, assumeYear) => {
    for (const m of s.matchAll(/(?:€|eur(?:o)?\b)\s*(\d[\d.,]*)(?:,-|,—)?/gi)) {
      const after = s.slice(m.index + m[0].length, m.index + m[0].length + 60);
      const upToNextAmount = after.split(/€/)[0];
      if (/m²|m2|vierkante\s*meter|sq\.?\s*m/i.test(upToNextAmount)) continue;
      const amount = parseNum(m[1]);
      if (amount == null) continue;
      let perYear = null;
      const yi = upToNextAmount.search(YEAR_RE);
      const mi = upToNextAmount.search(MONTH_RE);
      if (mi >= 0 && (yi < 0 || mi < yi)) perYear = amount * 12;
      else if (yi >= 0) perYear = amount;
      else if (assumeYear) perYear = amount;
      if (perYear == null) continue;
      perYear = Math.round(perYear * 100) / 100;
      if (perYear < 100 || perYear > 25000) continue;
      return perYear;
    }
    return null;
  };
  // A labelled price row with no period stated is taken as per year (funda
  // states space prices annually); a generic "Parkeren" row must say so.
  const parkPriceLabelRaw = fieldValue(
    "huurprijs parkeerplaats", "huurprijs parkeerplaatsen", "prijs parkeerplaats", "prijs parkeerplaatsen",
    "huurprijs per parkeerplaats", "parkeerplaats huurprijs", "rental price parking space", "parking price",
  );
  const parkLabelRaw = parkPriceLabelRaw || fieldValue("parkeerplaatsen", "parkeren", "parking", "parking spaces");
  let parkPrice = parkLabelRaw ? parsePrice(parkLabelRaw, !!parkPriceLabelRaw) : null;
  if (parkPrice != null) out.parkingPriceRaw = clip(parkLabelRaw);
  if (parkPrice == null) {
    let headingUntil = -1; // lines up to this index sit under a parking heading
    for (let i = 0; i < textLines.length; i++) {
      const t = textLines[i];
      const isParkingHeading = t.length <= 40 && /^[^€\d]*(?:parkeer|parkeren|parking)/i.test(t);
      if (isParkingHeading) headingUntil = i + 4;
      if (!/€|eur/i.test(t)) continue;
      if (!PARKING_CTX.test(t) && i > headingUntil) continue;
      const price = parsePrice(t, false);
      if (price != null) {
        parkPrice = price;
        out.parkingPriceRaw = clip(sentenceWith(t, (x) => parsePrice(x, false) != null));
        break;
      }
    }
  }
  out.parkingPriceEurYear = parkPrice;

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
    // A standalone class letter only — "Het kantoorgebouw beschikt over
    // A+++" must read A+++, not the E of "HET".
    const em =
      enRaw.match(/(?:^|[^A-Za-z])([A-G])(\+{0,5})(?![A-Za-z])/) ||
      enRaw.match(/(?:^|[^A-Za-z])([a-g])(\+{0,5})(?![A-Za-z])/);
    if (em) out.energyLabel = em[1].toUpperCase() + em[2];
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
    ["Meeting rooms", ["meeting room", "vergaderruimte", "vergaderzaal", "vergadercentrum", "conference room", "conference center", "conference centre"]],
    ["Auditorium", ["auditorium", "theater", "theatre"]],
    ["Furnished", ["furnished", "gemeubileerd", "turn-key", "turnkey"]],
    ["Lifts", ["lift core", "lift cores", "elevator", "passagierslift", "liften"]],
    ["Showers", ["shower", "douche"]],
    ["Reception", ["reception", "receptie", "concierge", "host"]],
    ["Catering", ["catering", "kantine", "bedrijfsrestaurant"]],
    ["Solar panels", ["solar panel", "zonnepanelen"]],
    ["Sustainability certified", ["breeam", "well platinum", "well gold", "leed", "paris proof", "net carbon zero"]],
  ];
  // Scoped to the listing's own facilities section when it has one — the
  // whole page's prose otherwise reads as the BUILDING's amenities too: a
  // "the area has restaurants and bars nearby" line in a Location
  // paragraph, a catering company's own name ("Vermaat Catering") — real
  // false positives seen on an actual listing. Requires the heading to be
  // its OWN line (not just the word appearing somewhere in a sentence —
  // "in de directe omgeving zijn veel voorzieningen aanwezig..." is not a
  // facilities heading and matched the loose version of this check on that
  // same listing). 40 lines comfortably covers a facilities bullet list
  // without running into the next, unrelated section. Falls back to the
  // whole page when no such heading line exists, so a listing that states
  // its facilities inline without one still gets scanned (the previous,
  // unscoped behaviour).
  const normLine = (s) => s.toLowerCase().replace(/[:*]+$/, "").trim();
  const facilitiesLineIdx = lines.findIndex((l) => /^(voorzieningen|faciliteiten|facilities|amenities)$/i.test(normLine(l)));
  const amenitiesSource = facilitiesLineIdx >= 0 ? lines.slice(facilitiesLineIdx, facilitiesLineIdx + 40).join(" ") : fullText;
  const low = amenitiesSource.toLowerCase();
  out.amenities = AMENITIES.filter(([, keys]) => keys.some((k) => low.includes(k))).map(([label]) => label);
  // "Underground parking" already implies parking — don't list both.
  if (out.amenities.includes("Underground parking")) {
    out.amenities = out.amenities.filter((a) => a !== "Parking");
  }

  // --- images -----------------------------------------------------------
  const isFunda = /(^|\.)funda\.nl$/i.test(location.hostname);
  // The page states its own photo count ("Foto's 15"); read it up front so
  // the scan below can stop early instead of walking every image reference
  // in a multi-megabyte page (a real listing embeds thousands). Prefer
  // funda's own count element when present \u2014 precise, no risk of matching
  // an unrelated "15" elsewhere in the page text.
  const countElText = isFunda
    ? document.querySelector(".media-viewer-overview__section-title-number")?.textContent?.trim()
    : null;
  const photoCountMatch = countElText ? [null, countElText] : bodyText.match(/foto['\u2019\u02bc]?s?\s*(\d{1,3})/i);
  out.photoTarget = photoCountMatch ? parseInt(photoCountMatch[1], 10) || 0 : 0;
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

  // Pass 0 — funda's own media CDN, scoped to a container that structurally
  // can't hold anything but this listing's own photos. Confirmed against
  // live markup: #overview-photos (the "Alle media" grid) is server-
  // rendered with the full photo set already present — the real URL sits
  // in each <img>'s data-lazy attribute (src is a 1x1 placeholder until the
  // lazy-loader swaps it in later), so reading data-lazy directly needs no
  // waiting. "Vergelijkbaar in de buurt" (similar nearby listings) is an
  // empty carousel in the raw HTML, only populated later by a separate
  // request into a different section entirely — it can't appear inside
  // #overview-photos regardless of timing, which is why scoping beats
  // trying to exclude it by link or by CDN origin alone (the CDN check
  // alone isn't enough: that module is served from the same CDN).
  //
  // In priority order:
  //   1. #overview-photos — the full set, server-rendered, via data-lazy.
  //   2. .media-viewer-fotos__slides inside [data-media-viewer-fotos] — the
  //      lightbox's own slideshow, same data-lazy pattern, same full set.
  //   3. [data-object-media-fotos] — the always-visible hero grid; real
  //      src/srcset (no data-lazy), but usually only 5-6 of the photos.
  //   4. findHeroBlock() — walks up from the "Foto's N" caption; a
  //      last-resort heuristic for when funda's markup has moved.
  //   5. The whole document, same as before any of this existed.
  // The CDN check and the link-based exclusion below still run inside
  // whichever container is chosen, as a second, cheap layer.
  const FUNDA_CDN_RE = /^https:\/\/cloud\.funda\.nl\/valentina_media\//;
  const currentObjectId = (location.pathname.match(/\/object-(\d+)/) || [])[1] || null;

  const findHeroBlock = () => {
    const countRe = /^foto['’ʼ]?s?\s*\d{1,3}$/i;
    let countEl = null;
    for (const el of document.querySelectorAll("button, a, span, div, p")) {
      const text = (el.textContent || "").trim();
      if (text && text.length < 30 && countRe.test(text)) { countEl = el; break; }
    }
    if (!countEl) return null;
    let node = countEl;
    for (let i = 0; i < 6 && node; i++) {
      if (node.querySelectorAll("img").length >= 2) return node;
      node = node.parentElement;
    }
    return null;
  };
  // The container search itself is gated behind the same cheap hostname
  // check as findHeroBlock()'s .textContent walk, so none of this runs
  // unconditionally on every popup open on every site.
  const scanRoot =
    (isFunda && document.getElementById("overview-photos")) ||
    (isFunda && document.querySelector("[data-media-viewer-fotos] .media-viewer-fotos__slides")) ||
    (isFunda && document.querySelector("[data-object-media-fotos]")) ||
    (isFunda && findHeroBlock()) ||
    document;

  const beforeFundaPass = out.photos.length;
  for (const img of scanRoot.querySelectorAll("img")) {
    // Cheap string tests first — closest("a[href]") walks the ancestor
    // chain, so it must only run for images that already look like a funda
    // gallery photo, not for every <img> in scanRoot. data-lazy first: it's
    // where #overview-photos and the lightbox slideshow hold the real URL
    // (src is a placeholder there until lazy-load swaps it in).
    const srcCandidates = [
      img.getAttribute("data-lazy"),
      img.currentSrc || null,
      img.getAttribute("src"),
      img.getAttribute("data-src"),
    ];
    pushSrcset(img.getAttribute("srcset") || img.getAttribute("data-srcset"), srcCandidates);
    const matches = srcCandidates.filter((c) => c && FUNDA_CDN_RE.test(c.split("?")[0]));
    if (matches.length === 0) continue;

    const parentLink = img.closest("a[href]");
    if (parentLink) {
      const href = parentLink.getAttribute("href") || "";
      const otherObjectId = (href.match(/\/object-(\d+)/) || [])[1] || null;
      if (href.includes("/makelaar/") || (otherObjectId && otherObjectId !== currentObjectId)) continue;
    }
    for (const c of matches) addPhoto(c.split("?")[0]);
  }

  // Pass 1/2 are skipped on "Pass 0 found something" on an actual funda.nl
  // page: there, Pass 0 is scoped to #overview-photos or the lightbox
  // slideshow, both server-rendered with the FULL gallery already present
  // via data-lazy (see the comment above) — running Pass 1/2 too would only
  // reintroduce the noise Pass 0 exists to exclude.
  //
  // On any other host — confirmed on fundainbusiness.nl, which serves
  // photos from the same cloud.funda.nl CDN but without that guarantee —
  // Pass 0 falls back to scanning the whole document, which only catches
  // whichever gallery slides happen to be mounted as real <img> elements at
  // that moment. A virtualized lightbox easily leaves most of a 22-photo
  // gallery unmounted, so "Pass 0 found 3" must NOT be read as "Pass 0
  // found everything" THERE — but Pass 1/2 are genuinely expensive (Pass 1
  // runs three full-string replaces plus a regex scan over the page's
  // entire HTML source, which on a heavy listing page can be several MB;
  // Pass 2 walks every <img>/<source>/<a>/background-image element in the
  // whole document), and running them unconditionally on every non-funda.nl
  // capture froze the tab for a second or more — a real regression, not
  // worth paying on a page where Pass 0 already found a solid set. Only pay
  // for them when Pass 0 is clearly short: below the page's own stated
  // photo count when known, else below a flat floor that a real gallery
  // (not just a couple of stray funda-CDN thumbnails elsewhere on the page)
  // should comfortably clear.
  const fundaPassYield = out.photos.length - beforeFundaPass;
  const metPhotoTarget = out.photoTarget > 0 ? fundaPassYield >= out.photoTarget : fundaPassYield >= 8;
  if (isFunda ? out.photos.length === beforeFundaPass : !metPhotoTarget) {
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
    // A content-heavy listing page can carry thousands of <img> elements
    // (ads, trackers, related-listing carousels) — capped the same way
    // Pass 1 is, so a pathological page can't turn this into another
    // multi-second scan.
    const candidates = [];
    for (const img of document.querySelectorAll("img")) {
      if (candidates.length >= PHOTO_SCAN_LIMIT * 4) break;
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
      if (candidates.length >= PHOTO_SCAN_LIMIT * 4) break;
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
    // Funda's own CDN (cloud.funda.nl/valentina_media) serves each photo's
    // srcset as a bare width suffix with no "w"/"h" prefix and no "x" —
    // "913_1440.jpg", "913_180.jpg", etc. — which none of the patterns
    // above catch, so every width came out as a separately-kept "photo".
    // Scoped to Funda's own documented srcset widths specifically (not any
    // trailing 2-4 digit number) so a genuinely different photo numbered
    // sequentially on some other site ("img_01.jpg", "img_02.jpg") never
    // collapses into its neighbour.
    s = s.replace(/[-_](?:180|360|720|1080|1440|2160)$/, "");
    s = s.replace(/[-_]{2,}/g, "-");
    return s.replace(/[-_./]+$/, "");
  };
  const dim = (u) => {
    const m = u.match(/(\d{2,4})x(\d{2,4})/);
    if (m) return Number(m[1]) * Number(m[2]);
    // Funda's own bare width suffix ("913_1440.jpg") has no height — compare
    // by the stated width alone so the largest srcset variant still wins
    // instead of "whichever happened to be seen first".
    const w = u.match(/[-_](180|360|720|1080|1440|2160)\.(?:jpe?g|png|webp|avif)(?:\?|$)/i);
    return w ? Number(w[1]) : 0;
  };
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

  // --- delivery: turn-key or shell & core --------------------------------
  // A labelled row first ("Opleveringsniveau"), then the copy. Only a clear
  // answer counts: a page that mentions both (or neither) is left blank for
  // the broker rather than guessed.
  const TURNKEY_RE = /turn[\s-]?key|instapklaar|gestoffeerd|gemeubileerd|fully\s+(?:fitted|furnished)|plug\s*(?:&|and|n)\s*play/i;
  const SHELL_RE = /\bcasco\b|cascostaat|shell\s*(?:&|and)\s*core/i;
  const pickDelivery = (s) => {
    if (!s) return null;
    const t = TURNKEY_RE.test(s);
    const c = SHELL_RE.test(s);
    return t && !c ? "turn_key" : c && !t ? "shell_and_core" : null;
  };
  out.delivery =
    pickDelivery(fieldValue("opleveringsniveau", "opleverniveau", "oplevering", "staat van oplevering", "delivery level", "delivery")) ||
    pickDelivery(fullText);

  // --- units per floor: area, rent and availability, one row per floor ---
  // Read line by line (and table row by row) from the listing:
  //   "3de verdieping: ca. 341 m² VVO kantoorruimte per direct beschikbaar;"
  //   "18de en 19de verdieping: ca. 985 m² VVO … per Q1 2027 beschikbaar."
  //   "- Begane grond: ca. 258 m²", "Verdieping 3: 500 m²"
  // and the rent per floor from lines such as
  //   "• Verdieping 3, 4 & 5: € 375,- per m²", "17 t/m 19: € 450,- per m²".
  // Floors offered together ("18de en 19de") stay one unit. Nothing is
  // estimated: a floor without a stated rent or date gets none.
  const ordinal = (n) => {
    const tens = n % 100;
    if (tens >= 11 && tens <= 13) return n + "th";
    return n + ({ 1: "st", 2: "nd", 3: "rd" } [n % 10] || "th");
  };
  const ORD = "(?:e|ste|de|st|nd|rd|th)";
  const FLOOR_WORD = "(?:verdiepingen|verdieping|verd\\.?|etages?|bouwlagen|bouwlaag|floors?|levels?)";
  const JOIN = "(?:\\s*(?:,|&|\\+|en|and|t\\/m|tot\\s*en\\s*met|tot|to|through|-|–|—)\\s*)";
  const GROUND = "(?:begane\\s*grond|ground\\s*floor|ground|bg|souterrain|basement|kelder)";
  const NUM_ITEM = `(?:${GROUND}|\\d{1,2}\\s*${ORD}?)`;
  // number-first: "18de en 19de verdieping", "begane grond", "3e-5e verdieping"
  // word-first: "Verdieping 3, 4 & 5", "Floor 17 t/m 19"
  const FLOOR_SPEC_SRC =
    `(?:(?:${NUM_ITEM}${JOIN}){0,8}\\d{1,2}\\s*${ORD}?\\s*${FLOOR_WORD}` +
    `|${FLOOR_WORD}\\s*\\d{1,2}(?:${JOIN}\\d{1,2}){0,8}` +
    `|(?:${GROUND})(?:${JOIN}\\d{1,2}\\s*${ORD}?\\s*${FLOOR_WORD})?)`;
  const floorSet = (spec) => {
    const s = spec.toLowerCase()
      .replace(/begane\s*grond|ground\s*floor|ground|\bbg\b/g, " 0 ")
      .replace(/souterrain|basement|kelder/g, " -1 ");
    const set = [];
    let rangeFrom = null;
    for (const m of s.matchAll(/(-1|\d{1,2})(?!\d)|(t\/m|tot\s*en\s*met|\btot\b|\bto\b|through|[-–—](?!1\b))/g)) {
      if (m[2]) { rangeFrom = set.length ? set[set.length - 1] : null; continue; }
      const n = parseInt(m[1], 10);
      if (rangeFrom != null && n > rangeFrom && n - rangeFrom <= 60) {
        for (let k = rangeFrom + 1; k <= n; k++) set.push(k);
      } else set.push(n);
      rangeFrom = null;
    }
    return [...new Set(set)].filter((n) => n >= -1 && n <= 60).sort((a, b) => a - b);
  };
  const floorName = (n) => (n === 0 ? "Ground floor" : n < 0 ? "Basement" : `${ordinal(n)} floor`);
  const unitLabel = (set) => {
    if (set.length === 1) return floorName(set[0]);
    const contiguous = set.every((n, i) => i === 0 || n === set[i - 1] + 1);
    const names = set.map((n) => (n === 0 ? "Ground" : n < 0 ? "Basement" : ordinal(n)));
    if (contiguous) return `${names[0]}–${names[names.length - 1]} floor`;
    return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]} floor`;
  };
  const AVAIL_RE =
    /\b(per\s*direct|direct\s*beschikbaar|direct|in\s*overleg|nader\s*overeen\s*te\s*komen|n\.?o\.?t\.?k\.?|immediately|by\s*arrangement|(?:per|vanaf|from|beschikbaar\s*(?:per|vanaf))\s*(?:q[1-4]\s*\d{4}|\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4}|\d{1,2}\s*[a-z]+\s*\d{4}|[a-z]+\s*\d{4}|\d{4}))/i;
  const normAvail = (s) => {
    if (!s) return null;
    let t = s.replace(/\s+/g, " ").trim();
    if (/^(?:direct|direct beschikbaar)$/i.test(t)) t = "per direct";
    t = t.replace(/\bq([1-4])\b/i, "Q$1");
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  // A per-m² rate ("€ 375,- per m² per jaar"; "€ 25 per m² per maand" → 300).
  // A lump sum for the whole floor is divided by that floor's area.
  const rateFrom = (s, area) => {
    const m = s.match(/(?:€|eur(?:o)?\b)\s*(\d[\d.,]*)(?:,-|,—)?([^€]{0,50})/i);
    if (!m) return null;
    const amount = parseNum(m[1]);
    if (amount == null) return null;
    const tail = m[2];
    if (/parkeer|parking|service/i.test(tail)) return null;
    const monthly = /per\s*(?:maand|mnd|month)|\/\s*(?:maand|mnd|mo|month)\b|\bp\.?\s*\/?\s*m\.?(?![a-z²2])/i.test(tail);
    const perM2 = /m²|m2|vierkante|sq\.?\s*m/i.test(tail);
    let rate;
    if (perM2) rate = monthly ? amount * 12 : amount;
    else if (area && amount > 2000) rate = (monthly ? amount * 12 : amount) / area;
    else if (!monthly && amount >= 20 && amount <= 2000) rate = amount; // table cell under a "€/m²/jaar" header
    else return null;
    rate = Math.round(rate * 100) / 100;
    return rate >= 20 && rate <= 2000 ? rate : null;
  };

  const units = new Map(); // key "3" / "18,19" → unit
  const addUnit = (set, area, rest, ctx) => {
    if (!set.length || area == null || area < 10 || area > 50000) return;
    const key = set.join(",");
    if (units.has(key)) return;
    units.set(key, {
      set, ctx,
      floor: unitLabel(set),
      area,
      rent: rest ? rateFrom(rest, area) : null,
      availability: rest ? normAvail((rest.match(AVAIL_RE) || [])[1]) : null,
    });
  };

  // 1) Tables, row by row, using the header to know which column is which.
  for (const table of document.querySelectorAll("table")) {
    const rows = [...table.querySelectorAll("tr")].map((tr) => [...tr.querySelectorAll("th, td")].map((c) => c.innerText.trim()));
    if (rows.length < 2) continue;
    const head = rows[0].map((h) => h.toLowerCase());
    const col = (re) => head.findIndex((h) => re.test(h));
    const areaCol = col(/m²|m2|oppervlak|vvo|area|size|sqm/);
    const rentCol = col(/huur|rent|prijs|price/);
    const availCol = col(/beschikbaar|aanvaarding|availab|oplevering|per\b/);
    for (const r of rows.slice(1)) {
      const fm = (r[0] || "").match(new RegExp(FLOOR_SPEC_SRC, "i"));
      if (!fm) continue;
      const areaCell = areaCol >= 0 ? r[areaCol] : r.find((c, i) => i > 0 && /m²|m2/i.test(c));
      const area = parseNum(areaCell);
      const rentCell = rentCol >= 0 && r[rentCol] ? (/€/.test(r[rentCol]) ? r[rentCol] : `€ ${r[rentCol]}`) : "";
      const availCell = availCol >= 0 ? r[availCol] : "";
      addUnit(floorSet(fm[0]), area, "", true);
      const u = units.get(floorSet(fm[0]).join(","));
      if (u && u.area === area) {
        if (u.rent == null && rentCell) u.rent = rateFrom(`${rentCell} ${/m²|m2/.test(head[rentCol] || "") ? "per m²" : ""}`, area);
        if (u.availability == null && availCell) u.availability = normAvail((availCell.match(AVAIL_RE) || [])[1]) || availCell.slice(0, 40);
      }
    }
  }

  // 2) Lines of text: "<floors> [:–] [ca.] <area> m² … [€ rent] … [availability]".
  const FLOOR_AREA_RE = new RegExp(
    `(${FLOOR_SPEC_SRC})[^\\S\\n]*[:,\\-–]?[^\\S\\n]*(?:(?:ca|circa|approx|appr|ongeveer|±|van|groot|totaal|of)\\.?[^\\S\\n]*)*(\\d[\\d.,]*)[^\\S\\n]*(?:m²|m2|sq\\.?\\s?m|vierkante)`,
    "gi",
  );
  // Cheap keyword checks first: the floor patterns are only worth running
  // on the few lines that name a floor at all.
  const HAS_FLOOR = /verdieping|verd\.|etage|floor|bouwla|level|begane|ground|souterrain|basement|kelder|\bbg\b/i;
  const floorLines = pairs.map(([k, v]) => `${k}: ${v}`).concat(textLines);
  for (let li = 0; li < floorLines.length; li++) {
    const t = floorLines[li];
    if (!HAS_FLOOR.test(t) || !/m²|m2|sq|vierkante/i.test(t)) continue;
    const matches = [...t.matchAll(FLOOR_AREA_RE)];
    for (let mi = 0; mi < matches.length; mi++) {
      const m = matches[mi];
      // Everything after the area up to the next floor in the same line.
      const restEnd = mi + 1 < matches.length ? matches[mi + 1].index : t.length;
      const rest = t.slice(m.index + m[0].length, restEnd);
      const near = floorLines.slice(Math.max(0, li - 3), li + 1).join(" ");
      addUnit(floorSet(m[1]), parseNum(m[2]), rest, /beschikbaar|verhuur|available|te huur|for rent|to let|aangeboden/i.test(near));
    }
  }

  // 3) Rent per floor stated separately ("Verdieping 8 & 9: € 395,- per m²").
  const RENT_LINE_RE = new RegExp(`(${FLOOR_SPEC_SRC})[^€\\n]{0,25}((?:€|eur(?:o)?\\b)[^\\n]*)`, "i");
  for (const t of textLines) {
    if (!HAS_FLOOR.test(t) || !/€|eur/i.test(t) || /parkeer|parking|service/i.test(t)) continue;
    const m = t.match(RENT_LINE_RE);
    if (!m || /m²|m2/i.test(t.slice(0, m.index + m[0].length - m[2].length).replace(m[1], ""))) continue; // an area line, handled above
    const set = floorSet(m[1]);
    const rate = rateFrom(m[2], null);
    if (!set.length || rate == null) continue;
    for (const u of units.values()) {
      if (u.rent == null && u.set.every((n) => set.includes(n))) u.rent = rate;
    }
  }

  let unitList = [...units.values()].sort((a, b) => a.set[0] - b.set[0]);
  // Two units claiming the same floor: keep the first one stated.
  {
    const taken = new Set();
    unitList = unitList.filter((u) => {
      if (u.set.some((n) => taken.has(n))) return false;
      u.set.forEach((n) => taken.add(n));
      return true;
    });
  }
  const unitSum = unitList.reduce((t, u) => t + u.area, 0);
  const offered = areaFromLooseScan ? null : out.availableAreaSqm;
  // Floor sizes that add up to MORE than the space on offer describe the
  // whole building, not what's for rent; a single stray floor mention only
  // counts when the text around it is about what's available.
  const plausible =
    unitList.length > 0 &&
    (offered == null || unitSum <= offered * 1.15) &&
    (unitList.length >= 2 || unitList[0].ctx || (offered != null && Math.abs(unitSum - offered) <= offered * 0.15));
  if (plausible) {
    out.floors = unitList.map((u) => ({ floor: u.floor, area: u.area, rent: u.rent, availability: u.availability }));
    if (offered == null) out.availableAreaSqm = unitSum;
  }

  out.sourceUrl = location.href;

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
    ["Parking ratio", data.parkingRatio || (data.parkingRatioRaw ? `? “${data.parkingRatioRaw}”` : null)],
    ["Rent €/m²/yr", data.rentEurPerM2Year], ["Service €/m²/yr", data.serviceChargeEurPerM2Year],
    ["Parking €/yr", data.parkingPriceEurYear],
    ["Available", data.availability],
    ["Lease term", data.contractTerm],
    ["Delivery", data.delivery === "turn_key" ? "Turn-key" : data.delivery === "shell_and_core" ? "Shell & core" : null],
    ["Per floor", (data.floors || []).map((f) =>
      [`${f.floor} ${f.area} m²`, f.rent != null ? `€ ${f.rent}` : null, f.availability].filter(Boolean).join(" · "),
    ).join("; ")],
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
  set("contractTerm", data.contractTerm);
  set("airportNote", data.airportNote);
  set("accessibilityNote", data.highwayNote);
  set("publicTransportNote", data.publicTransportNote);
  set("delivery", data.delivery);
  // One entry per floor: { floor, area, rent, availability } as JSON.
  if (data.floors && data.floors.length) set("floors", JSON.stringify(data.floors));
  set("parkingRatioRaw", data.parkingRatioRaw);
  set("parkingPriceRaw", data.parkingPriceRaw);
  set("sourceUrl", data.sourceUrl);

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

// Runs INSIDE the listing tab, just before extractListing. funda in business
// only puts the full description on the page once "Lees de volledige
// omschrijving" is clicked — and the service charges, parking ratio and
// parking price are often stated only in that part. So the expander is
// clicked here, the same click the user would make, and the read waits until
// the text has arrived. Only elements that open text in place are clicked: a
// real link to another page is never followed. Must be fully self-contained.
async function expandHiddenText() {
  const EXPAND_RE = /^(?:lees|toon|bekijk)\s+(?:de\s+)?(?:volledige\s+|hele\s+)?(?:omschrijving|beschrijving)$|^(?:lees|toon)\s+(?:meer|verder)$|^meer\s+lezen$|^read\s+(?:the\s+)?(?:full\s+)?(?:description|more)$|^show\s+(?:the\s+)?(?:full\s+)?(?:description|more)$/i;
  const textOf = (el) => (el.textContent || "").replace(/\s+/g, " ").trim();
  const navigates = (el) => {
    const a = el.closest("a[href]");
    if (!a) return false;
    const href = (a.getAttribute("href") || "").trim();
    return !(href === "" || href.startsWith("#") || /^javascript:/i.test(href));
  };
  if (!document.body) return { clicked: 0 };
  // The element that holds the expander label; the click bubbles to
  // whatever handler sits on an ancestor. Found via text nodes, which is
  // quick even on a heavy page.
  const found = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const t = node.nodeValue.replace(/\s+/g, " ").trim();
    if (!t || t.length > 50 || !EXPAND_RE.test(t)) continue;
    const el = node.parentElement;
    if (el && !/^(?:SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/i.test(el.nodeName)) found.add(el);
  }
  for (const el of document.body.querySelectorAll('button, [role="button"], summary')) {
    if (EXPAND_RE.test(textOf(el))) found.add(el);
  }
  // One click per expander: a button and the label span inside it are the
  // same control, and clicking both would open it and close it again.
  const targets = [...found].filter(
    (el) =>
      ![...found].some((other) => other !== el && el.contains(other)) &&
      !el.closest('[aria-expanded="true"]') &&
      !navigates(el),
  );
  if (!targets.length) return { clicked: 0 };

  const lengthNow = () => (document.body ? document.body.textContent.length : 0);
  const before = lengthNow();
  for (const el of targets) {
    try { el.click(); } catch (e) { /* one stubborn element must not stop the read */ }
  }
  // Wait for the text to land (it may be fetched), then for it to settle.
  // A page that already had the text (only clipped by CSS) doesn't grow at
  // all, so give up waiting after a short while instead of the full budget.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const startedAt = performance.now();
  let last = lengthNow();
  let grew = false;
  while (performance.now() - startedAt < 2500) {
    await sleep(100);
    const now = lengthNow();
    if (now > before + 100) grew = true;
    if (grew && now === last) break;
    if (!grew && performance.now() - startedAt > 1200) break;
    last = now;
  }
  return { clicked: targets.length, grewBy: lengthNow() - before };
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
  // Open a collapsed description first. Best effort: if it fails or takes
  // too long, the page is still read as it is.
  try {
    await withTimeout(
      chrome.scripting.executeScript({ target: { tabId: tab.id }, func: expandHiddenText }),
      3500,
      "expand timed out",
    );
  } catch (e) {
    /* read the page as it is */
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
