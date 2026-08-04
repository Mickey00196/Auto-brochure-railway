"use strict";

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
        out.photos = (Array.isArray(img) ? img : [img]).filter(Boolean).slice(0, 8);
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

  // --- area (range → max, else single) ---
  const range = bodyText.match(/([\d.,]+)\s*(?:m2|m²)?\s*(?:tot|to|-|–|—)\s*([\d.,]+)\s*(?:m2|m²)/i);
  const single = bodyText.match(/([\d.,]+)\s*(?:m2|m²)/i);
  if (range) out.areaSqm = parseNum(range[2]);
  else if (single) out.areaSqm = parseNum(single[1]);

  // --- energy label (A–G, optional +'s, standalone) ---
  const en = bodyText.toUpperCase().match(/\b([A-G])(\+*)(?![A-Za-z0-9])/);
  if (en) out.energyLabel = en[1] + en[2];

  // --- year built ---
  const yr = bodyText.match(/\b(1[89]\d{2}|20\d{2})\b/);
  if (yr) out.yearBuilt = parseInt(yr[1], 10);

  // --- address (from JSON-LD gaps, then title/heading) ---
  if (!out.street || !out.city) {
    const src = out.name || document.title || bodyText.slice(0, 200);
    const pc = src.match(/\b(\d{4})\s?([A-Za-z]{2})\b/);
    if (pc && !out.postalCode) out.postalCode = pc[1] + " " + pc[2].toUpperCase();
    const sh = src.match(/([A-Za-zÀ-ÿ.\-'\s]+?)\s+(\d+[\s-]?[A-Za-z]?)\b/);
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

  // --- extra images (incl. lazy-load attrs + srcset) ---
  if (out.photos.length < 4) {
    const SKIP = ["logo", "icon", "sprite", "avatar", "pixel", "placeholder"];
    for (const img of document.querySelectorAll("img")) {
      const cands = [
        img.getAttribute("src"), img.getAttribute("data-src"),
        img.getAttribute("data-lazy-src"), img.getAttribute("data-original"),
      ];
      const srcset = img.getAttribute("srcset") || img.getAttribute("data-srcset");
      if (srcset) srcset.split(",").forEach((p) => cands.push(p.trim().split(" ")[0]));
      for (let s of cands) {
        if (!s) continue;
        if (!/^https?:\/\//.test(s) && !s.startsWith("/")) continue;
        if (SKIP.some((k) => s.toLowerCase().includes(k))) continue;
        try { s = new URL(s, location.href).href; } catch (e) { continue; }
        if (!out.photos.includes(s)) out.photos.push(s);
        if (out.photos.length >= 8) break;
      }
      if (out.photos.length >= 8) break;
    }
  }
  out.photos = out.photos.map((u) => { try { return new URL(u, location.href).href; } catch (e) { return u; } });

  return out;
}

// ---- popup wiring ---------------------------------------------------------
const appUrlInput = document.getElementById("appUrl");
const statusEl = document.getElementById("status");
const previewEl = document.getElementById("preview");

chrome.storage.local.get("appUrl", (d) => {
  if (d.appUrl) appUrlInput.value = d.appUrl;
});
appUrlInput.addEventListener("change", () =>
  chrome.storage.local.set({ appUrl: appUrlInput.value.trim() }),
);

document.getElementById("capture").addEventListener("click", async () => {
  statusEl.className = "";
  previewEl.innerHTML = "";
  const appUrl = appUrlInput.value.trim().replace(/\/+$/, "");
  if (!appUrl) {
    statusEl.className = "err";
    statusEl.textContent = "Set your Proposal Engine URL first.";
    return;
  }
  chrome.storage.local.set({ appUrl });
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

  await chrome.tabs.create({ url: appUrl + "/buildings/new?" + p.toString() });

  statusEl.className = "ok";
  statusEl.textContent = "Opened Add Building with the details filled in — review and save.";
  const fields = [
    ["Name", data.name], ["Address", data.address], ["City", data.city],
    ["Area m²", data.areaSqm], ["Energy", data.energyLabel], ["Photos", (data.photos || []).length],
  ];
  for (const [k, v] of fields) {
    const div = document.createElement("div");
    div.textContent = k + ": " + (v == null || v === "" ? "—" : v);
    previewEl.appendChild(div);
  }
});
