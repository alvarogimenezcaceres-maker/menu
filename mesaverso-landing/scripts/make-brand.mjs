// Builds the MESAVERSO logo files (src/brand/*.svg, src/favicon.svg) from the geometry in
// scripts/brand.mjs (brand manual 5B). Run: npm run brand   (then npm run images for the PNGs)
//
// Main logo: the isotype REPLACES the M of the word → [M]ESAVERSO (never "isotype + MESAVERSO").
// The word "ESAVERSO" is Familjen Grotesk SemiBold (OFL) converted to outlines in the SVG files;
// on the page it is live text (logoHtml in brand.mjs) so it stays crisp and selectable.
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import { ANIM, C, CAP, CROP, LETTER, M_GAP, M_W, STROKE, STROKE_SMALL, glyph } from "./brand.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src/brand");

const THEMES = {
  dark: { line: C.titanio, start: C.titanio, end: C.luz, text: C.niebla }, // on Noche
  light: { line: C.noche, start: C.noche, end: C.noche, text: C.noche }, // on Niebla: no warm light
  black: { line: "#000", start: "#000", end: "#000", text: "#000" },
  white: { line: "#fff", start: "#fff", end: "#fff", text: "#fff" },
  current: { line: "currentColor", start: "currentColor", end: "currentColor", text: "currentColor" },
};

const FONT_URL = "https://fonts.gstatic.com/s/familjengrotesk/v11/Qw3LZR9ZHiDnImG6-NEMQ41wby8WRnYsfkunR_eGfMFXbizt.ttf"; // SemiBold 600
const res = await fetch(FONT_URL);
if (!res.ok) throw new Error(`Font download failed (${res.status})`);
const font = opentype.parse(await res.arrayBuffer());
if (font.tables.os2.sCapHeight / font.unitsPerEm !== CAP) throw new Error("Familjen Grotesk cap height changed: update CAP");

// "ESAVERSO" as outlines, font-size 100 → the M (cap height) is 65 units tall.
const SIZE = 100;
function word(text, tracking) {
  let x = 0, d = "";
  for (const ch of text) {
    const g = font.charToGlyph(ch);
    d += g.getPath(x, 0, SIZE).toPathData(2); // baseline at y=0
    x += (g.advanceWidth / font.unitsPerEm) * SIZE + tracking * SIZE;
  }
  return { d, width: x - tracking * SIZE };
}

// Lockup: M box scaled so CROP.h → CAP*SIZE, dots' bottom on the baseline (y=0).
function lockup(t, { small = false } = {}) {
  const tracking = small ? 0.06 : LETTER;
  const w = word("ESAVERSO", tracking);
  const s = (CAP * SIZE) / CROP.h;
  const mw = M_W * SIZE;
  const gap = (M_GAP + tracking) * SIZE;
  const top = -CAP * SIZE;
  const W = Math.ceil(mw + gap + w.width);
  const H = Math.ceil(CAP * SIZE);
  const m = `<g transform="translate(0 ${top}) scale(${s.toFixed(5)}) translate(${-CROP.x} ${-CROP.y})">${glyph(t, { stroke: small ? STROKE_SMALL : STROKE })}</g>`;
  // 2 units of air above/below: "S" and "O" overshoot the cap height and the baseline.
  return svg(`0 ${top - 2} ${W} ${H + 4}`, `${m}<path fill="${t.text}" transform="translate(${(mw + gap).toFixed(2)} 0)" d="${w.d}"/>`);
}
const svg = (viewBox, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="MESAVERSO">${body}</svg>\n`;
const isotype = (t, o) => svg("0 0 100 100", glyph(t, o));
// App icon / favicon: Noche tile, radius ~23%, glyph at 60% of the side.
const tile = ({ stroke = STROKE } = {}) => {
  const side = 100, g = 0.6 * side, s = g / CROP.w;
  const tx = (side - g) / 2, ty = (side - CROP.h * s) / 2;
  return svg("0 0 100 100", `<rect width="100" height="100" rx="23" fill="${C.noche}"/><g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(5)}) translate(${-CROP.x} ${-CROP.y})">${glyph(THEMES.dark, { stroke })}</g>`);
};

await mkdir(OUT, { recursive: true });
for (const f of await readdir(OUT)) if (f.endsWith(".svg") || f.endsWith(".html")) await rm(path.join(OUT, f));
const files = {
  "logo-mesaverso.svg": lockup(THEMES.dark), // master: [M]ESAVERSO on dark backgrounds
  "logo-mesaverso-dark.svg": lockup(THEMES.dark),
  "logo-mesaverso-light.svg": lockup(THEMES.light), // all Noche, for light backgrounds and print
  "logo-mesaverso-black.svg": lockup(THEMES.black),
  "logo-mesaverso-white.svg": lockup(THEMES.white),
  "logo-mesaverso-small.svg": lockup(THEMES.dark, { small: true }), // for use below ~20px cap size
  "isotype-mesaverso.svg": isotype(THEMES.dark),
  "isotype-mesaverso-light.svg": isotype(THEMES.light),
  "isotype-mesaverso-mono.svg": isotype(THEMES.current), // takes the CSS colour
  "app-icon-mesaverso.svg": tile(),
};
// Animated isotype for the web (SMIL; the dot starts at cx/cy 0 and animateMotion places it on the line).
files["isotype-mesaverso-animated.svg"] = svg("0 0 100 100", `${glyph(THEMES.dark, { endDot: false })}<circle r="10" fill="${C.luz}" cx="0" cy="0">${ANIM}</circle>`);
for (const [name, content] of Object.entries(files)) await writeFile(path.join(OUT, name), content);
await writeFile(path.join(ROOT, "src/favicon.svg"), tile({ stroke: STROKE_SMALL }));

console.log(`src/brand: ${Object.keys(files).length} files`);
