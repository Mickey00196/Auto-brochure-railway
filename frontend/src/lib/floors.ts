// Floor names for the capture page's "Available per floor" stack. Shared by
// the server page (sorting what the extension sent) and the client form
// (naming a newly added floor), so it lives outside the "use client" module.

export interface CaptureFloor {
  floor: string;
  area: string;
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

/** Ground = 0, basement = -1, "3rd floor" = 3; anything unrecognised = 99. */
export function floorRank(label: string): number {
  if (/ground|begane|\bbg\b/i.test(label)) return 0;
  if (/basement|souterrain|kelder/i.test(label)) return -1;
  const m = label.match(/\d+/);
  return m ? Number(m[0]) : 99;
}

export function floorLabel(rank: number): string {
  if (rank === 0) return "Ground floor";
  if (rank < 0) return "Basement";
  return `${ordinal(rank)} floor`;
}

/** The extension's `floors` param: "Ground floor:280;1st floor:301". Sorted
 * bottom-up, duplicates and sizeless entries dropped. */
export function parseFloorsParam(raw: string | undefined): CaptureFloor[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const floors: CaptureFloor[] = [];
  for (const part of raw.split(";")) {
    const at = part.lastIndexOf(":");
    if (at <= 0) continue;
    const floor = part.slice(0, at).trim();
    const area = part.slice(at + 1).trim();
    if (!floor || !/\d/.test(area) || seen.has(floor.toLowerCase())) continue;
    seen.add(floor.toLowerCase());
    floors.push({ floor, area });
  }
  return floors.sort((a, b) => floorRank(a.floor) - floorRank(b.floor));
}
