// The Dutch energy-label colours, A (green) to G (red), for the small label
// badge on the capture page and the building page.
const ENERGY_COLORS: Record<string, { bg: string; fg: string }> = {
  A: { bg: "#1E7A3B", fg: "#FFFFFF" },
  B: { bg: "#4C9A2A", fg: "#FFFFFF" },
  C: { bg: "#A3B800", fg: "#0F1B33" },
  D: { bg: "#F2C500", fg: "#0F1B33" },
  E: { bg: "#F29100", fg: "#0F1B33" },
  F: { bg: "#E5541B", fg: "#FFFFFF" },
  G: { bg: "#D2232A", fg: "#FFFFFF" },
};

export const ENERGY_OPTIONS = ["A++++", "A+++", "A++", "A+", "A", "B", "C", "D", "E", "F", "G"];

export function energyColor(label: string | null | undefined): { bg: string; fg: string } | undefined {
  return label ? ENERGY_COLORS[label.trim().charAt(0).toUpperCase()] : undefined;
}
