// Updating a building that's already in the library from a fresh capture
// (the "Update" button on the capture page's duplicate warning).
//
// The building and unit PUTs replace the whole record, so the capture is
// merged into what's stored first: what the listing states replaces the old
// value, anything it doesn't state is kept. Pure functions, no I/O.

import type { Building, Unit } from "./types";

const blank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** The captured value when the listing stated one, otherwise the stored one. */
export function prefer<T>(captured: T | null | undefined, existing: T | null | undefined): T | null {
  return blank(captured) ? (existing ?? null) : (captured as T);
}

/** Stored items first (their order was chosen), then new captured ones. */
export function union(existing: string[], captured: string[], key = (s: string) => s.trim().toLowerCase()): string[] {
  const seen = new Set(existing.map(key));
  return [...existing, ...captured.filter((s) => !seen.has(key(s)) && seen.add(key(s)))];
}

/** The full building payload for PUT /buildings/{id}. */
export function mergeBuilding(existing: Building, captured: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(captured)) {
    if (key === "photos" || key === "building_amenities") continue;
    merged[key] = prefer(value, (existing as unknown as Record<string, unknown>)[key]);
  }
  merged.photos = union(existing.photos ?? [], (captured.photos as string[] | undefined) ?? [], (s) => s);
  merged.building_amenities = union(existing.building_amenities ?? [], (captured.building_amenities as string[] | undefined) ?? []);
  // Response-only fields; the PUT doesn't take them.
  delete merged.building_id;
  delete merged.created_at;
  delete merged.updated_at;
  delete merged.units;
  return merged;
}

/** "3rd floor", "3e verdieping", "Floor 3" → "3"; "Ground floor" → "0". */
export function floorKey(label: string | null | undefined): string {
  const t = (label ?? "").toLowerCase().trim();
  if (!t) return "";
  if (/ground|begane|\bbg\b/.test(t)) return "0";
  if (/basement|souterrain|kelder/.test(t)) return "-1";
  const nums = t.match(/\d+/g);
  return nums ? nums.join("-") : t;
}

/** Which stored unit each captured piece updates (null = add it as new).
 * Matched by floor; a capture with one space and no floor updates the
 * building's only space. Stored spaces the capture doesn't mention stay. */
export function matchUnits<P extends { floor: string | null }>(pieces: P[], existing: Unit[]): (Unit | null)[] {
  const used = new Set<string>();
  return pieces.map((piece) => {
    const key = floorKey(piece.floor);
    let match = key ? existing.find((u) => !used.has(u.unit_id) && floorKey(u.floor) === key) : undefined;
    if (!match && pieces.length === 1 && existing.length === 1 && (!key || !floorKey(existing[0].floor))) {
      match = existing[0];
    }
    if (!match) return null;
    used.add(match.unit_id);
    return match;
  });
}

/** The full unit payload for PUT /units/{id}. */
export function mergeUnit(existing: Unit, captured: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(captured)) {
    merged[key] = prefer(value, (existing as unknown as Record<string, unknown>)[key]);
  }
  // A price type only says "fixed" when there's now a price to go with it.
  if (merged.rent_eur_per_m2_year != null) merged.rent_price_type = "fixed";
  if (merged.service_charge_eur_per_m2_year != null) merged.service_charge_price_type = "fixed";
  delete merged.unit_id;
  delete merged.created_at;
  delete merged.updated_at;
  delete merged.building;
  return merged;
}
