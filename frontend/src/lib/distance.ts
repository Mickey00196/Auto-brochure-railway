/** "Amsterdam Sloterdijk 450 m" → { place, value }. Distance notes come from
 * the listing or the /geo/distances lookup, both shaped "<place> <distance>". */
export function splitDistance(note: string): { place: string; value: string } {
  // Older notes put the distance first: "0.5 km (Amsterdam Sloterdijk)".
  const lead = note.trim().match(/^(\d+(?:[.,]\d+)?\s*(?:km|m))\s*\((.+)\)$/i);
  if (lead) return { place: lead[2].trim(), value: lead[1].replace(/\s+/g, " ") };
  const m = note.trim().match(/^(.*?)[\s:,-]*(\d+(?:[.,]\d+)?\s*(?:km|m|min\.?|minutes?|minuten))$/i);
  if (!m) return { place: note.trim(), value: "" };
  return { place: m[1].trim(), value: m[2].replace(/\s+/g, " ") };
}
