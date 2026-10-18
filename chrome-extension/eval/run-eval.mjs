// Runs the extension's own extractListing() on every sample brochure in
// samples/ and compares the result with the hand-filled *.expected.json.
//
//   node chrome-extension/eval/run-eval.mjs                 # current popup.js
//   node chrome-extension/eval/run-eval.mjs --popup old.js  # any other version
//   node chrome-extension/eval/run-eval.mjs --json          # machine-readable
//
// Each fixture is served at its listing-like URL (expected.json "url") so
// host-specific code paths run as they would on the real site. Needs
// Playwright; PLAYWRIGHT_MODULE / CHROMIUM_PATH override where it's found.
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const samplesDir = join(repo, "samples");
const args = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const popupPath = resolve(argValue("--popup", join(repo, "chrome-extension/popup.js")));
const asJson = args.includes("--json");

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require(process.env.PLAYWRIGHT_MODULE || "playwright");
} catch {
  playwright = require("/opt/node22/lib/node_modules/playwright");
}

const src = readFileSync(popupPath, "utf8");
const extractSrc = src.match(/function extractListing\(\)[\s\S]*?\n}\n/)[0];
// The popup opens a collapsed description before reading (expandHiddenText);
// run it the same way when this version has it, so the eval mirrors a real read.
const expandSrc = (src.match(/async function expandHiddenText\(\)[\s\S]*?\n}\n/) || [null])[0];

// Older versions sent floors as "3rd floor:341;4th floor:490" — read both
// shapes so a before/after run compares like with like.
const asFloors = (v) => {
  if (v == null || v === "") return [];
  if (Array.isArray(v)) return v;
  return String(v).split(";").map((part) => {
    const at = part.lastIndexOf(":");
    return { floor: part.slice(0, at), area: Number(part.slice(at + 1)), rent: null, availability: null };
  });
};
const same = (a, b) => {
  if (a == null || a === "") return b == null || b === "";
  if (typeof a === "number") return typeof b === "number" && Math.abs(a - b) < 0.01;
  return String(a).trim() === String(b ?? "").trim();
};
const floorOk = (exp, got) =>
  got && same(exp.floor, got.floor) && same(exp.area, got.area) && same(exp.rent, got.rent) && same(exp.availability, got.availability);

function compare(expected, data) {
  const fields = [];
  for (const [key, exp] of Object.entries(expected)) {
    if (key === "floors") {
      const got = asFloors(data.floors);
      const ok = exp.filter((f) => floorOk(f, got.find((g) => same(f.floor, g.floor))));
      fields.push({
        key,
        pass: ok.length === exp.length && got.length === exp.length,
        score: `${ok.length}/${exp.length}` + (got.length > exp.length ? ` (+${got.length - exp.length} extra)` : ""),
        expected: exp,
        got,
      });
    } else if (key === "amenities") {
      const got = data.amenities || [];
      const missing = exp.filter((a) => !got.includes(a));
      const extra = got.filter((a) => !exp.includes(a));
      fields.push({ key, pass: !missing.length && !extra.length, expected: exp, got, missing, extra });
    } else {
      fields.push({ key, pass: same(exp, data[key]), expected: exp, got: data[key] ?? null });
    }
  }
  return fields;
}

const browser = await playwright.chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const results = [];
for (const file of readdirSync(samplesDir).filter((f) => f.endsWith(".expected.json")).sort()) {
  const spec = JSON.parse(readFileSync(join(samplesDir, file), "utf8"));
  const html = readFileSync(join(samplesDir, spec.fixture), "utf8");
  const page = await browser.newPage();
  await page.route(spec.url, (r) => r.fulfill({ status: 200, contentType: "text/html", body: html }));
  await page.goto(spec.url, { waitUntil: "load" });
  if (expandSrc) {
    // The popup never clicks in a page's first 3 s (it may still be setting
    // itself up); a person has been on the listing longer than that, so wait.
    await page.waitForFunction(() => performance.now() >= 3000, null, { timeout: 5000 });
    await page.evaluate((s) => new Function(`return (${s})`)()(), expandSrc);
  }
  const data = await page.evaluate((s) => new Function(`return (${s})`)()(), extractSrc);
  await page.close();
  results.push({ sample: file.replace(".expected.json", ""), fields: compare(spec.expected, data) });
}
await browser.close();

if (asJson) {
  console.log(JSON.stringify(results, null, 2));
} else {
  const show = (v) => (v == null ? "null" : typeof v === "object" ? JSON.stringify(v) : String(v));
  let pass = 0;
  let total = 0;
  for (const r of results) {
    console.log(`\n${r.sample}`);
    for (const f of r.fields) {
      total += 1;
      if (f.pass) pass += 1;
      const detail = f.key === "floors"
        ? `${f.score}${f.pass ? "" : `\n      got: ${f.got.map((g) => [g.floor, g.area, g.rent, g.availability].map(show).join(" | ")).join("\n           ")}`}`
        : f.key === "amenities"
          ? f.pass ? "" : `missing ${show(f.missing)} extra ${show(f.extra)}`
          : f.pass ? show(f.got) : `expected ${show(f.expected)}, got ${show(f.got)}`;
      console.log(`  ${f.pass ? "PASS" : "FAIL"}  ${f.key.padEnd(26)} ${detail}`);
    }
  }
  console.log(`\n${pass}/${total} fields correct  (${popupPath.replace(repo + "/", "")})`);
}
