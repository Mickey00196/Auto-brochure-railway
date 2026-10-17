/** Everything the client's live link says, in English and Dutch, plus the
 * translation of the values that come in from listings (funda is Dutch, the
 * Chrome extension writes floors in English). The listing's own description
 * is left as written — it's the landlord's text, not ours to rewrite. */
import type { BrochureLanguage } from "@/lib/types";

export type Lang = BrochureLanguage;

const en = {
  locale: "en-GB",
  shortlistFor: "Office shortlist for",
  title: (name: string) => `${name} – Office shortlist`,
  ogDescription: (n: number) => `${n} office building${n === 1 ? "" : "s"} on this shortlist.`,
  countLine: (n: number, cities: string) => `${n} building${n === 1 ? "" : "s"}${cities ? ` in ${cities}` : ""}`,
  updated: (date: string) => `Updated ${date}`,
  preparedBy: (name: string) => `Prepared by ${name}`,
  seeShortlist: "See the shortlist",
  downloadPdf: "Download PDF",
  preparing: "Preparing…",
  planViewing: "Plan a viewing",
  call: "Call",
  email: "Email",
  buildingsNav: "Buildings on this shortlist",
  empty: "No buildings have been added to this shortlist yet.",
  atAGlance: "At a glance",
  whereOffices: (n: number, cities: string) =>
    `Where the ${n === 1 ? "office is" : `${n} offices are`}${cities ? ` in ${cities}` : ""}`,
  availableTotal: (area: string) => `${area} available in total`,
  all: "All",
  of: "of",
  rent: "Rent",
  serviceCharges: "Service charges",
  available: "Available",
  parkingRatio: "Parking ratio",
  parking: "Parking",
  onRequest: "On request",
  from: "from",
  perSqmYear: "/m²/yr",
  perSpaceYear: "/space/yr",
  perSpaceMonth: "/space/mo",
  perDeskMonth: "/desk/mo",
  perYear: "/yr",
  whyOnList: "Why it’s on your shortlist",
  pointsToConsider: "Points to consider",
  perFloor: "Available per floor",
  inTotal: (area: string) => `${area} in total`,
  space: (n: number) => `Space ${n}`,
  yearlyNote:
    "≈ yearly cost: (rent + service charges) × m², excl. VAT and parking. Where service charges aren’t known yet, rent only.",
  details: "Details",
  rentableFrom: "Rentable from",
  delivery: "Delivery",
  availableFrom: "Available from",
  energyLabel: "Energy label",
  yearBuilt: "Year built",
  buildingArea: "Total building area",
  breeam: "BREEAM",
  amenities: "Amenities",
  gettingThere: "Getting there",
  highway: "Highway",
  airport: "Airport",
  transit: "Public transport",
  viewAllPhotos: (n: number) => `View all ${n} photos`,
  openPhotos: (name: string) => `Open the photos of ${name}`,
  openPhoto: (n: number, name: string) => `Open photo ${n} of ${name}`,
  allPhotosOf: (name: string) => `All photos of ${name}`,
  photo: (n: number) => `Photo ${n}`,
  photoOf: (name: string, n: number) => `${name}, photo ${n}`,
  closeGallery: "Close gallery",
  previousPhoto: "Previous photo",
  nextPhoto: "Next photo",
  floorPlan: "Floor plan",
  floorPlanOf: (name: string) => `${name} floor plan`,
  next: "Next",
  backToCover: "Back to the cover",
  backToTop: "Back to top",
  yourContact: "Your contact",
  footerLine: (client: string, by: string) => `Prepared for ${client} by ${by}. This page stays up to date as the shortlist changes.`,
  viewingSubject: (client: string, building?: string) =>
    building ? `Viewing request: ${building} (${client})` : `Viewing request: ${client} office shortlist`,
  loadingMap: "Loading map…",
  viewBuilding: "View building",
  delivery_turn_key: "Turn-key",
  delivery_shell_and_core: "Shell & core",
  delivery_shell_and_core_plus: "Shell & core+",
  delivery_mixed: "Mixed",
};

type Text = typeof en;

const nl: Text = {
  locale: "nl-NL",
  shortlistFor: "Kantorenshortlist voor",
  title: (name: string) => `${name} – Kantorenshortlist`,
  ogDescription: (n: number) => `${n} kantoorgebouw${n === 1 ? "" : "en"} op deze shortlist.`,
  countLine: (n: number, cities: string) => `${n} gebouw${n === 1 ? "" : "en"}${cities ? ` in ${cities}` : ""}`,
  updated: (date: string) => `Bijgewerkt ${date}`,
  preparedBy: (name: string) => `Opgesteld door ${name}`,
  seeShortlist: "Bekijk de shortlist",
  downloadPdf: "Download pdf",
  preparing: "Bezig…",
  planViewing: "Plan een bezichtiging",
  call: "Bellen",
  email: "E-mail",
  buildingsNav: "Gebouwen op deze shortlist",
  empty: "Er staan nog geen gebouwen op deze shortlist.",
  atAGlance: "In één oogopslag",
  whereOffices: (n: number, cities: string) =>
    `Waar ${n === 1 ? "het kantoor ligt" : `de ${n} kantoren liggen`}${cities ? ` in ${cities}` : ""}`,
  availableTotal: (area: string) => `${area} beschikbaar in totaal`,
  all: "Alle",
  of: "van",
  rent: "Huurprijs",
  serviceCharges: "Servicekosten",
  available: "Beschikbaar",
  parkingRatio: "Parkeernorm",
  parking: "Parkeren",
  onRequest: "Op aanvraag",
  from: "vanaf",
  perSqmYear: "/m²/jaar",
  perSpaceYear: "/plaats/jaar",
  perSpaceMonth: "/plaats/mnd",
  perDeskMonth: "/werkplek/mnd",
  perYear: "/jaar",
  whyOnList: "Waarom op je shortlist",
  pointsToConsider: "Aandachtspunten",
  perFloor: "Beschikbaar per verdieping",
  inTotal: (area: string) => `${area} in totaal`,
  space: (n: number) => `Ruimte ${n}`,
  yearlyNote:
    "≈ kosten per jaar: (huur + servicekosten) × m², excl. btw en parkeren. Waar de servicekosten nog niet bekend zijn, alleen huur.",
  details: "Details",
  rentableFrom: "Huurbaar vanaf",
  delivery: "Opleverniveau",
  availableFrom: "Beschikbaar per",
  energyLabel: "Energielabel",
  yearBuilt: "Bouwjaar",
  buildingArea: "Totale oppervlakte gebouw",
  breeam: "BREEAM",
  amenities: "Voorzieningen",
  gettingThere: "Bereikbaarheid",
  highway: "Snelweg",
  airport: "Luchthaven",
  transit: "Openbaar vervoer",
  viewAllPhotos: (n: number) => `Bekijk alle ${n} foto’s`,
  openPhotos: (name: string) => `Open de foto’s van ${name}`,
  openPhoto: (n: number, name: string) => `Open foto ${n} van ${name}`,
  allPhotosOf: (name: string) => `Alle foto’s van ${name}`,
  photo: (n: number) => `Foto ${n}`,
  photoOf: (name: string, n: number) => `${name}, foto ${n}`,
  closeGallery: "Galerij sluiten",
  previousPhoto: "Vorige foto",
  nextPhoto: "Volgende foto",
  floorPlan: "Plattegrond",
  floorPlanOf: (name: string) => `Plattegrond ${name}`,
  next: "Volgende",
  backToCover: "Terug naar de voorpagina",
  backToTop: "Terug naar boven",
  yourContact: "Je contactpersoon",
  footerLine: (client: string, by: string) =>
    `Opgesteld voor ${client} door ${by}. Deze pagina blijft actueel als de shortlist verandert.`,
  viewingSubject: (client: string, building?: string) =>
    building ? `Bezichtiging: ${building} (${client})` : `Bezichtiging: kantorenshortlist ${client}`,
  loadingMap: "Kaart laden…",
  viewBuilding: "Bekijk gebouw",
  delivery_turn_key: "Turn-key",
  delivery_shell_and_core: "Casco",
  delivery_shell_and_core_plus: "Casco+",
  delivery_mixed: "Gemengd",
};

export function brochureText(lang: Lang | null | undefined): Text {
  return lang === "nl" ? nl : en;
}

/** "turn_key" → "Turn-key", "shell_and_core" → "Shell & core" / "Casco". */
export function deliveryLabel(t: Text, condition: string | null | undefined): string | null {
  if (!condition) return null;
  const labels: Record<string, string> = {
    turn_key: t.delivery_turn_key,
    shell_and_core: t.delivery_shell_and_core,
    shell_and_core_plus: t.delivery_shell_and_core_plus,
    mixed: t.delivery_mixed,
  };
  return labels[condition] ?? condition;
}

export type BrochureText = Text;

// ── Numbers ───────────────────────────────────────────────────────────────

export function numberFormat(lang: Lang) {
  const nf = new Intl.NumberFormat(lang === "nl" ? "nl-NL" : "en-GB", { maximumFractionDigits: 0 });
  const num = (v: number) => nf.format(v);
  return {
    num,
    area: (v: number) => `${nf.format(v)} m²`,
    // "€375" in English, "€ 375" in Dutch.
    money: (v: number) => (lang === "nl" ? `€ ${nf.format(v)}` : `€${nf.format(v)}`),
  };
}

// ── Values that come in from listings ─────────────────────────────────────

const MONTHS_NL = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** "Per direct" ↔ "Available now", "In overleg" ↔ "By arrangement",
 * "Per Q1 2027" ↔ "From Q1 2027", month names. Anything unrecognised is
 * passed through as the broker typed it. */
export function translateAvailability(raw: string, lang: Lang): string {
  const s = raw.trim();
  if (!s) return s;
  if (lang === "en") {
    if (/^(per\s+)?direct(\s+beschikbaar)?$|^direct\s+beschikbaar$|^per\s+direct\s+beschikbaar$/i.test(s)) return "Available now";
    if (/^in\s+overleg$|^nader\s+overeen\s+te\s+komen$|^n\.?o\.?t\.?k\.?$/i.test(s)) return "By arrangement";
    if (/^op\s+aanvraag$/i.test(s)) return "On request";
    let out = s.replace(/^per\s+/i, "From ").replace(/^vanaf\s+/i, "From ");
    MONTHS_NL.forEach((m, i) => (out = out.replace(new RegExp(`\\b${m}\\b`, "gi"), MONTHS_EN[i])));
    return cap(out);
  }
  if (/^(available\s+)?(now|immediately)$|^immediately\s+available$|^available\s+now$/i.test(s)) return "Per direct";
  if (/^by\s+arrangement$|^negotiable$|^tbd$|^to\s+be\s+agreed$|^upon\s+request$/i.test(s)) return "In overleg";
  if (/^on\s+request$/i.test(s)) return "Op aanvraag";
  let out = s.replace(/^(available\s+)?from\s+/i, "Per ");
  MONTHS_EN.forEach((m, i) => (out = out.replace(new RegExp(`\\b${m}\\b`, "gi"), MONTHS_NL[i])));
  return cap(out);
}

const ORDINAL_EN = (n: number) => {
  const r10 = n % 10;
  const r100 = n % 100;
  if (r10 === 1 && r100 !== 11) return `${n}st`;
  if (r10 === 2 && r100 !== 12) return `${n}nd`;
  if (r10 === 3 && r100 !== 13) return `${n}rd`;
  return `${n}th`;
};

/** "3rd floor – unit A" ↔ "3e verdieping – unit A", "Ground floor" ↔
 * "Begane grond", "18th–19th floor" ↔ "18e–19e verdieping". */
export function translateFloor(raw: string, lang: Lang): string {
  const s = raw.trim();
  if (lang === "nl") {
    return cap(
      s
        .replace(/\bground\s+floor\b/gi, "begane grond")
        .replace(/\b(\d+)(?:st|nd|rd|th)\b/gi, "$1e")
        .replace(/\bfloors?\b/gi, "verdieping")
        .replace(/\bbasement\b/gi, "kelder"),
    );
  }
  return cap(
    s
      .replace(/\bbegane\s+grond\b/gi, "ground floor")
      .replace(/\b(\d+)e\b/gi, (_, n) => ORDINAL_EN(Number(n)))
      .replace(/\b(verdieping|etage)\b/gi, "floor")
      .replace(/\bkelder\b/gi, "basement"),
  );
}

// funda's amenity tags and the English ones a broker types, both ways.
const AMENITIES: [string, string][] = [
  ["Topkoeling", "Comfort cooling"],
  ["Koeling", "Cooling"],
  ["Inbouwarmaturen", "Recessed lighting"],
  ["Liften", "Lifts"],
  ["Lift", "Lift"],
  ["Te openen ramen", "Openable windows"],
  ["Toilet", "Toilets"],
  ["Toiletten", "Toilets"],
  ["Pantry", "Pantry"],
  ["Verwarming", "Heating"],
  ["Kamerindeling", "Cellular offices"],
  ["Systeemplafond", "Suspended ceiling"],
  ["Vloerbedekking", "Carpeting"],
  ["Kabelgoten", "Cable trays"],
  ["Mechanische ventilatie", "Mechanical ventilation"],
  ["Luchtbehandeling", "Air handling"],
  ["Rolstoelvriendelijk", "Wheelchair accessible"],
  ["Fietsenstalling", "Bike storage"],
  ["Douches", "Showers"],
  ["Dakterras", "Roof terrace"],
  ["Receptie", "Reception"],
  ["Restaurant", "Restaurant"],
  ["Sportschool", "Gym"],
  ["Vergaderruimtes", "Meeting rooms"],
  ["Parkeerkelder", "Underground parking"],
  ["Laadpalen", "EV charging"],
  ["Beveiliging", "Security"],
  ["Alarminstallatie", "Alarm system"],
  ["Fietsenstalling", "Bike parking"],
  ["Dakterras", "Rooftop terrace"],
  ["Vergadercentrum", "Meeting centre"],
  ["Lobbycafé", "Lobby café"],
  ["Hospitalitybalie", "Hospitality desk"],
];
const toEn = new Map(AMENITIES.map(([n, e]) => [n.toLowerCase(), e]));
const toNl = new Map(AMENITIES.map(([n, e]) => [e.toLowerCase(), n]));

/** Translated, capitalised and de-duplicated — funda sends "liften",
 * "te openen ramen" in lower case next to "Topkoeling". */
export function translateAmenities(list: string[], lang: Lang): string[] {
  const map = lang === "en" ? toEn : toNl;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const s = raw.trim();
    if (!s) continue;
    const label = cap(map.get(s.toLowerCase()) ?? s);
    if (seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push(label);
  }
  return out;
}

export function formatDate(iso: string | undefined, lang: Lang): string {
  const d = iso ? new Date(iso.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`) : new Date();
  return d.toLocaleDateString(lang === "nl" ? "nl-NL" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Amsterdam",
  });
}

export function listJoin(items: string[], lang: Lang): string {
  return new Intl.ListFormat(lang === "nl" ? "nl" : "en", { style: "long", type: "conjunction" }).format(items);
}

/** "4.1 km" → "4,1 km" in Dutch; English is left as it is. */
export function localDecimal(value: string, lang: Lang): string {
  return lang === "nl" ? value.replace(/(\d)\.(\d)/g, "$1,$2") : value;
}
