"use strict";

// Your Proposal Engine app URL. Change this one line if it ever moves.
const APP_URL = "https://proposal-engine-frontend-production.up.railway.app";

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

  const out = {
    name: null, address: null, street: null, houseNumber: null,
    postalCode: null, city: null, description: null, energyLabel: null,
    yearBuilt: null, areaSqm: null, amenities: [], photos: [],
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

  // --- area (labeled value first; then range → max, else single) ---
  const totalRaw = fieldValue("oppervlakte", "totale oppervlakte", "total surface", "vloeroppervlakte", "surface");
  if (totalRaw && /m²|m2/i.test(totalRaw)) out.areaSqm = parseNum(totalRaw);
  if (out.areaSqm == null) {
    const range = bodyText.match(/([\d.,]+)\s*(?:m2|m²)?\s*(?:tot|to|-|–|—)\s*([\d.,]+)\s*(?:m2|m²)/i);
    const single = bodyText.match(/([\d.,]+)\s*(?:m2|m²)/i);
    if (range) out.areaSqm = parseNum(range[2]);
    else if (single) out.areaSqm = parseNum(single[1]);
  }

  // --- available area approx. ("in units vanaf" = min divisible, NOT this) ---
  const availRaw = fieldValue("beschikbare oppervlakte", "beschikbaar oppervlakte", "available surface", "available approx.", "available area");
  if (availRaw && /m²|m2/i.test(availRaw)) out.availableAreaSqm = parseNum(availRaw);

  // --- availability / acceptance date ---
  // "Aanvaarding" is funda's label; a bare "beschikbaar" only counts when the
  // value is NOT an area (an area means it was the available-surface row).
  const acceptRaw = fieldValue("aanvaarding", "beschikbaar", "beschikbaar per", "beschikbaar vanaf", "availability", "available", "available from");
  if (acceptRaw && !/m²|m2/i.test(acceptRaw)) out.availability = acceptRaw;

  // --- parking ratio ("1:80", or prose "1 parkeerplaats per 80 m²") ---
  const ratioRaw = fieldValue("parkeerratio", "parking ratio", "parkeernorm");
  if (ratioRaw) {
    const rm = ratioRaw.match(/1\s*(?:op|:|per)\s*([\d.,]+)/i);
    out.parkingRatio = rm ? `1:${rm[1].replace(/[.,]$/, "")}` : ratioRaw;
  } else {
    const rp = bodyText.match(/1\s*parkeerplaats\s*per\s*([\d.,]+)\s*m/i) || bodyText.match(/parking\s*ratio[^\d]{0,10}1\s*[:op]+\s*(\d+)/i);
    if (rp) out.parkingRatio = `1:${rp[1]}`;
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
    const am = bodyText.match(/schiphol[^\S\n]*(?:op|:)?[^\S\n]*([\d.,]+\s*(?:km|m|min[a-z.]*))/i);
    if (am) out.airportNote = `Schiphol ${am[1]}`;
  }
  out.highwayNote = fieldNote("snelweg", "afrit", "afrit snelweg", "afstand tot snelweg", "highway", "motorway", "distance highway");
  if (!out.highwayNote) {
    const hm = bodyText.match(/\b(A\d{1,3})\b[^\S\n]*(?:op|:)?[^\S\n]*([\d.,]+\s*(?:km|m)\b)/i);
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
    const em = bodyText.match(/energ(?:ielabel|y\s*(?:label|rating))\s*:?\s*([A-Ga-g])(\+{0,5})/i);
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
    const src = out.name || document.title || bodyText.slice(0, 200);
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

  // --- amenities (keyword match, NL + EN) ---
  const AM = [
    "roof terrace", "dakterras", "bicycle storage", "fietsenstalling", "24/7 access",
    "restaurant", "gym", "fitness", "parking", "parkeren", "air conditioning",
    "airconditioning", "meeting room", "vergaderruimte", "furnished", "gemeubileerd",
  ];
  const low = bodyText.toLowerCase();
  out.amenities = AM.filter((a) => low.includes(a)).map((a) => a.replace(/\b\w/g, (c) => c.toUpperCase()));

  // --- images -----------------------------------------------------------
  // No cap: collect every unique, non-skip-listed image URL on the page.
  const SKIP = ["logo", "icon", "sprite", "avatar", "pixel", "placeholder", "spinner", "loading"];
  const seen = new Set(out.photos);
  const addPhoto = (raw) => {
    if (!raw) return;
    if (!/^https?:\/\//.test(raw) && !raw.startsWith("/")) return;
    if (SKIP.some((k) => raw.toLowerCase().includes(k))) return;
    let u;
    try { u = new URL(raw, location.href).href; } catch (e) { return; }
    if (!seen.has(u)) { seen.add(u); out.photos.push(u); }
  };

  // Pass 1 — regex over the page's own HTML source. Listing pages routinely
  // embed the full gallery in inline JSON/state (before lazy <img> tags swap
  // in their real src), so the complete photo list is usually already in the
  // markup. We unescape JSON "\/" first, then match image URLs on any host.
  // (If you later want to narrow this to the site's own photo CDN, tighten
  // the host part of the regex once you've seen a real captured page.)
  const html = document.documentElement.outerHTML.replace(/\\\//g, "/");
  const IMG_URL_RE = /https?:\/\/[^"'\s)\\]+\.(?:jpe?g|png|webp)(?:\?[^"'\s)\\]*)?/gi;
  let m;
  while ((m = IMG_URL_RE.exec(html)) !== null) addPhoto(m[0]);

  // Pass 2 — <img> scan (incl. lazy-load attrs + srcset), only as a fallback
  // when the inline-HTML pass found little (some sites render galleries as
  // background images or plain <img> without embedding the list).
  if (out.photos.length < 4) {
    for (const img of document.querySelectorAll("img")) {
      const cands = [
        img.getAttribute("src"), img.getAttribute("data-src"),
        img.getAttribute("data-lazy-src"), img.getAttribute("data-original"),
      ];
      const srcset = img.getAttribute("srcset") || img.getAttribute("data-srcset");
      if (srcset) srcset.split(",").forEach((p) => cands.push(p.trim().split(" ")[0]));
      cands.forEach(addPhoto);
    }
  }

  // --- collapse size/resolution variants + drop non-listing images -------
  // A single photo is usually served at several sizes (thumbnail + full, or
  // ?w=320 / ?w=1600), which is why a raw scan over-counts massively. Collapse
  // by a size-agnostic key so each real photo is kept once, preferring the
  // largest-looking variant. Also drop obvious non-listing images (agent
  // portraits, brand logos) by keyword.
  const EXTRA_SKIP = ["makelaar", "portret", "portrait", "headshot", "medewerker", "employee", "team-", "brand"];
  const sizeAgnostic = (u) => {
    let s = u.toLowerCase().split("?")[0].split("#")[0];
    s = s.replace(/\d{2,4}x\d{2,4}/g, "")
         .replace(/[-_/](thumbnails|thumbnail|thumbs|thumb|small|medium|large|preview|mini|xs|sm|md|lg|xl)\b/g, "")
         .replace(/[-_](w|h)\d{2,4}\b/g, "");
    return s.replace(/[-_/]+$/, "");
  };
  const dim = (u) => { const m = u.match(/(\d{2,4})x(\d{2,4})/); return m ? Number(m[1]) * Number(m[2]) : 0; };
  const thumbish = (u) => (/(thumb|small|preview|mini)/i.test(u) ? 1 : 0);
  const looksLarger = (a, b) =>
    thumbish(a) !== thumbish(b) ? thumbish(a) < thumbish(b) : dim(a) >= dim(b);

  const byKey = new Map();
  for (let u of out.photos) {
    try { u = new URL(u, location.href).href; } catch (e) { continue; }
    if (EXTRA_SKIP.some((k) => u.toLowerCase().includes(k))) continue;
    const key = sizeAgnostic(u);
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
  const fm = bodyText.match(/foto['’’]?s?\s*(\d{1,3})/i);
  out.photoTarget = fm ? parseInt(fm[1], 10) : 0;
  if (out.photoTarget > 0 && out.photos.length > out.photoTarget) {
    out.photos = out.photos.slice(0, out.photoTarget);
  }

  return out;
}

// ---- popup wiring ---------------------------------------------------------
const statusEl = document.getElementById("status");
const previewEl = document.getElementById("preview");

document.getElementById("capture").addEventListener("click", async () => {
  statusEl.className = "";
  previewEl.innerHTML = "";
  statusEl.textContent = "Reading the open page…";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let results;
  try {
    results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractListing });
  } catch (e) {
    statusEl.className = "err";
    statusEl.textContent = "Could not read this tab: " + e.message;
    return;
  }
  const data = results && results[0] && results[0].result;
  if (!data) {
    statusEl.className = "err";
    statusEl.textContent = "Nothing captured from this page.";
    return;
  }
  if (data.blocked) {
    statusEl.className = "warn";
    statusEl.textContent = "This looks like a verification page — open the real listing first, then capture.";
    return;
  }

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
  set("parkingRatio", data.parkingRatio);
  set("rentEurPerM2Year", data.rentEurPerM2Year);
  set("serviceChargeEurPerM2Year", data.serviceChargeEurPerM2Year);
  set("parkingPriceEurYear", data.parkingPriceEurYear);
  set("availability", data.availability);
  set("airportNote", data.airportNote);
  set("accessibilityNote", data.highwayNote);
  set("publicTransportNote", data.publicTransportNote);

  await chrome.tabs.create({ url: APP_URL.replace(/\/+$/, "") + "/buildings/new?" + p.toString() });

  const photoCount = (data.photos || []).length;
  const target = data.photoTarget || 0;
  statusEl.className = "ok";
  statusEl.textContent = `Opened Add Building with the details filled in — ${photoCount} photo${photoCount === 1 ? "" : "s"} captured. Review and save.`;
  const photosLabel = target ? `${photoCount} (page says ${target})` : photoCount;
  const fields = [
    ["Name", data.name], ["Address", data.address], ["City", data.city],
    ["Subarea", data.subarea],
    ["Total m²", data.areaSqm], ["Available m²", data.availableAreaSqm],
    ["Parking ratio", data.parkingRatio],
    ["Rent €/m²/yr", data.rentEurPerM2Year], ["Service €/m²/yr", data.serviceChargeEurPerM2Year],
    ["Parking €/yr", data.parkingPriceEurYear],
    ["Available", data.availability],
    ["Energy", data.energyLabel], ["Year built", data.yearBuilt],
    ["Airport", data.airportNote], ["Highway", data.highwayNote], ["Public transport", data.publicTransportNote],
    ["Photos", photosLabel],
  ];
  for (const [k, v] of fields) {
    const div = document.createElement("div");
    div.textContent = k + ": " + (v == null || v === "" ? "—" : v);
    previewEl.appendChild(div);
  }
});
