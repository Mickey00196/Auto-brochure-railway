"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapBuilding = {
  id: string;
  number: string;
  name: string;
  address: string;
  available: string;
  city: string;
  lat: number;
  lng: number;
  /** Optional extra line for the hover label, e.g. "581 m²". */
  label?: string;
  /** Where the popup's link goes — defaults to the brochure's in-page
   * anchor (#id); the library passes the building's own page. */
  href?: string;
};

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

// The client brochure's base map: Kadaster's grey BRT achtergrondkaart via
// PDOK — a quiet, purpose-made background map of the Netherlands (CC BY 4.0,
// attribution "Kadaster"), so the pins carry the colour. It only covers the
// Netherlands, so a shortlist with a building abroad — or PDOK not answering
// — falls back to the greyed OpenStreetMap layer.
const PDOK_GREY = "https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png";
const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const inNetherlands = (b: { lat: number; lng: number }) => b.lat > 50.7 && b.lat < 53.7 && b.lng > 3.2 && b.lng < 7.3;

export default function ShortlistMap({
  buildings,
  city,
  hoveredId,
  fitMaxZoom,
  muted = false,
  variant = "default",
  viewLabel = "View building",
  availableLabel = "available",
}: {
  buildings: MapBuilding[];
  city: string | null;
  hoveredId: string | null;
  /** Never zoom in further than this when fitting the pins — 13 keeps the
   * whole city in view, so a client sees where the offices are in it. */
  fitMaxZoom?: number;
  /** Grey base map, so the navy pins are what stands out. */
  muted?: boolean;
  /** "brochure": the client page's styling — Kadaster's grey base map,
   * navy pins, card popups, one-finger page scroll on phones. */
  variant?: "default" | "brochure";
  /** Popup link text, in the page's language. */
  viewLabel?: string;
  availableLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  const visible = city ? buildings.filter((b) => b.city === city) : buildings;
  const visibleKey = visible.map((b) => b.id).join(",");

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const container = ref.current;
    const brochure = variant === "brochure";
    const map = L.map(container, {
      scrollWheelZoom: false,
      // On a phone, one finger scrolls the page, not the map — pinch still
      // zooms. Otherwise the map traps the client halfway down the page.
      dragging: !(brochure && L.Browser.mobile),
      zoomControl: true,
      attributionControl: true,
    });
    map.attributionControl.setPrefix(false);
    const osm = L.tileLayer(OSM, { attribution: OSM_ATTRIBUTION, maxZoom: 19 });
    if (brochure && buildings.length > 0 && buildings.every(inNetherlands)) {
      const pdok = L.tileLayer(PDOK_GREY, {
        attribution: 'Kaart: <a href="https://www.kadaster.nl">Kadaster</a>',
        maxZoom: 19,
        minZoom: 6,
      });
      let loaded = 0;
      let failed = 0;
      pdok.on("tileload", () => (loaded += 1));
      pdok.on("tileerror", () => {
        failed += 1;
        if (loaded === 0 && failed === 4 && map.hasLayer(pdok)) {
          map.removeLayer(pdok);
          osm.addTo(map);
          container.classList.add("shortlist-map--muted");
        }
      });
      pdok.addTo(map);
    } else {
      osm.addTo(map);
      if (brochure) container.classList.add("shortlist-map--muted");
    }
    mapRef.current = map;
    const markers = markersRef.current;
    return () => {
      map.remove();
      mapRef.current = null;
      markers.clear();
    };
    // Mount-only: the base map is picked once, from the first set of pins.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();
    const pts: L.LatLngTuple[] = [];
    for (const b of visible) {
      const icon = L.divIcon({
        className: "shortlist-pin",
        html: `<span>${esc(b.number)}</span>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });
      const m = L.marker([b.lat, b.lng], { icon, keyboard: true, title: `${b.number} ${b.name}` }).addTo(map);
      m.bindPopup(
        variant === "brochure"
          ? `<a class="shortlist-card" href="${esc(b.href ?? `#${b.id}`)}"><span class="shortlist-card-num">${esc(b.number)}</span><span class="shortlist-card-body"><strong>${esc(b.name)}</strong><span>${esc(b.address)}</span><em>${esc(b.available)} ${esc(availableLabel)}</em></span><span class="shortlist-card-go">${esc(viewLabel)} →</span></a>`
          : `<div class="shortlist-popup"><strong>${esc(b.number)} · ${esc(b.name)}</strong><br/>${esc(b.address)}<br/>${esc(b.available)} ${esc(availableLabel)}<br/><a href="${esc(b.href ?? `#${b.id}`)}">${esc(viewLabel)}</a></div>`,
        variant === "brochure" ? { className: "shortlist-card-popup", closeButton: false, offset: [0, -14], maxWidth: 280 } : undefined,
      );
      m.bindTooltip(`${esc(b.number)} · ${esc(b.name)}${b.label ? ` · ${esc(b.label)}` : ""}`, {
        direction: "top",
        offset: [0, -18],
        className: "shortlist-tip",
      });
      markersRef.current.set(b.id, m);
      pts.push([b.lat, b.lng]);
    }
    const fitOptions = fitMaxZoom ? { maxZoom: fitMaxZoom } : {};
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.18), fitOptions);

    // The print layout gives the map a different size than the screen did,
    // and Leaflet only measures its container on load — without this the
    // pins land in the wrong place (or off the edge) in the PDF. For print,
    // keep the current zoom and just re-centre: those tiles are already
    // loaded, whereas a new zoom level would still be downloading when the
    // browser takes its print snapshot. Only zoom out if the pins no longer
    // fit at all.
    const bounds = pts.length ? L.latLngBounds(pts) : null;
    const refitForPrint = () => {
      map.invalidateSize({ animate: false, pan: false });
      if (!bounds) return;
      map.setView(bounds.getCenter(), map.getZoom(), { animate: false });
      if (!map.getBounds().contains(bounds)) map.fitBounds(bounds.pad(0.05), { animate: false, ...fitOptions });
    };
    const refitForScreen = () => {
      map.invalidateSize({ animate: false });
      if (bounds) map.fitBounds(bounds.pad(0.18), { animate: false, ...fitOptions });
    };
    const printQuery = window.matchMedia("print");
    const onPrintChange = (e: MediaQueryListEvent) => (e.matches ? refitForPrint() : refitForScreen());
    window.addEventListener("beforeprint", refitForPrint);
    window.addEventListener("afterprint", refitForScreen);
    printQuery.addEventListener("change", onPrintChange);
    return () => {
      window.removeEventListener("beforeprint", refitForPrint);
      window.removeEventListener("afterprint", refitForScreen);
      printQuery.removeEventListener("change", onPrintChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey, city]);

  useEffect(() => {
    markersRef.current.forEach((m, id) => {
      const active = id === hoveredId;
      const el = m.getElement();
      if (el) el.classList.toggle("shortlist-pin--active", active);
      // Hovering a building in the list names it on the map, on top of any
      // pin it overlaps.
      m.setZIndexOffset(active ? 1000 : 0);
      if (active) m.openTooltip();
      else m.closeTooltip();
    });
  }, [hoveredId]);

  return (
    <div
      ref={ref}
      className={`h-full w-full ${muted && variant !== "brochure" ? "shortlist-map--muted" : ""} ${
        variant === "brochure" ? "shortlist-map--brochure" : ""
      }`}
    />
  );
}
