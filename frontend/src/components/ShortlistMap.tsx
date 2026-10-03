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
};

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

export default function ShortlistMap({
  buildings,
  city,
  hoveredId,
}: {
  buildings: MapBuilding[];
  city: string | null;
  hoveredId: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  const visible = city ? buildings.filter((b) => b.city === city) : buildings;
  const visibleKey = visible.map((b) => b.id).join(",");

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, { scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    const markers = markersRef.current;
    return () => {
      map.remove();
      mapRef.current = null;
      markers.clear();
    };
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
      const m = L.marker([b.lat, b.lng], { icon }).addTo(map);
      m.bindPopup(
        `<div class="shortlist-popup"><strong>${esc(b.number)} · ${esc(b.name)}</strong><br/>${esc(b.address)}<br/>${esc(b.available)} available<br/><a href="#${esc(b.id)}">View building</a></div>`,
      );
      markersRef.current.set(b.id, m);
      pts.push([b.lat, b.lng]);
    }
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.18));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey, city]);

  useEffect(() => {
    markersRef.current.forEach((m, id) => {
      const el = m.getElement();
      if (el) el.classList.toggle("shortlist-pin--active", id === hoveredId);
    });
  }, [hoveredId]);

  return <div ref={ref} className="h-full w-full" />;
}
