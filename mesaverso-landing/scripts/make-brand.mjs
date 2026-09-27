// Builds the Mesaverso logo files (src/brand/*.svg and src/favicon.svg) from one geometry.
// The wordmark is Instrument Sans (OFL, Google Fonts) converted to outlines, so the SVGs never
// depend on an installed font. Run: npm run brand   (then npm run images for the PNGs)
//
// Isotype on a 32-unit grid: an "M" drawn as a menu folded like an accordion. The two stems face
// the viewer (brand blue), the two inner panels are the fold (the "verso", a second tone), and the
// dot sitting in the fold is the dish (saffron). One idea: the physical menu, unfolded into
// another dimension, carrying the food.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src/brand");

// Brand colours (mirrors the primitives in src/styles.css).
const C = {
  anil: "#3A5BF0", // stems, CTA
  anilLight: "#9DB0FF", // fold on dark backgrounds
  anilDeep: "#1C2A7A", // fold on light backgrounds
  azafran: "#FFB547", // dish on dark backgrounds
  azafranDeep: "#EE8F0E", // dish on light backgrounds (more visible on white)
  tinta: "#0A0C15", // ink / dark background
  papel: "#F3F5FB", // text on dark
};

const STEMS = "M4.5 5H10v22H4.5A1.5 1.5 0 0 1 3 25.5v-19A1.5 1.5 0 0 1 4.5 5zM27.5 5H22v22h5.5a1.5 1.5 0 0 0 1.5-1.5v-19A1.5 1.5 0 0 0 27.5 5z";
// One-colour version: the stems stop short of the fold lines so the fold still reads without a second tone.
const STEMS_CUT = "M4.5 5h4.8v22H4.5A1.5 1.5 0 0 1 3 25.5v-19A1.5 1.5 0 0 1 4.5 5zM27.5 5h-4.8v22h4.8a1.5 1.5 0 0 0 1.5-1.5v-19A1.5 1.5 0 0 0 27.5 5z";
const FOLD = "M10 5l6 8.2V23l-6-8.2zM22 5l-6 8.2V23l6-8.2z";
const DISH = { cx: 16, cy: 6.7, r: 2.3 };

const mark = ({ stem, fold, dish, mono }) =>
  `<path fill="${stem}" d="${mono ? STEMS_CUT : STEMS}"/><path fill="${fold}" d="${FOLD}"/><circle cx="${DISH.cx}" cy="${DISH.cy}" r="${DISH.r}" fill="${dish}"/>`;

const THEMES = {
  light: { stem: C.anil, fold: C.anilDeep, dish: C.azafranDeep, text: C.tinta }, // on light backgrounds
  dark: { stem: C.anil, fold: C.anilLight, dish: C.azafran, text: C.papel }, // on dark backgrounds
  black: { stem: "#000", fold: "#000", dish: "#000", text: "#000", mono: true },
  white: { stem: "#fff", fold: "#fff", dish: "#fff", text: "#fff", mono: true },
  current: { stem: "currentColor", fold: "currentColor", dish: "currentColor", text: "currentColor", mono: true },
};

// Wordmark: "mesa" bold + "verso" regular: from the solid table to the lighter, other side.
// Every letter of "mesaverso" is x-height, so the word is one clean band aligned to the M.
const FONT_URLS = {
  700: "https://fonts.gstatic.com/s/instrumentsans/v4/pximypc9vsFDm051Uf6KVwgkfoSxQ0GsQv8ToedPibnr-yp2JGEJOH9npSQi_gf1.ttf",
  400: "https://fonts.gstatic.com/s/instrumentsans/v4/pximypc9vsFDm051Uf6KVwgkfoSxQ0GsQv8ToedPibnr-yp2JGEJOH9npSTF-Qf1.ttf",
};
const fonts = {};
for (const [w, url] of Object.entries(FONT_URLS)) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font download failed: ${url} (${res.status})`);
  fonts[w] = opentype.parse(await res.arrayBuffer());
}
const X_HEIGHT = 13; // units on the 32 grid (M is 22 tall)
const BASELINE = 23;
const TRACK = -0.012; // em
function word(runs) {
  let x = 0;
  let d = "";
  for (const [text, w] of runs) {
    const f = fonts[w];
    const size = X_HEIGHT / (f.tables.os2.sxHeight / f.unitsPerEm);
    for (const ch of text) {
      const g = f.charToGlyph(ch);
      d += g.getPath(x, BASELINE, size).toPathData(2);
      x += (g.advanceWidth / f.unitsPerEm) * size + TRACK * size;
    }
  }
  return { d, width: x };
}
const WM = word([["mesa", 700], ["verso", 400]]);
const GAP = 7; // icon → word
const WM_X = 29 + GAP;
const LOCKUP_W = Math.ceil(WM_X + WM.width + 3);

const svg = (w, h, body, label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}">${body}</svg>\n`;
const lockup = (t) => svg(LOCKUP_W, 32, `${mark(t)}<path fill="${t.text}" transform="translate(${WM_X} 0)" d="${WM.d}"/>`, "Mesaverso");
const wordmark = (t) => svg(Math.ceil(WM.width + 1), 32, `<path fill="${t.text}" d="${WM.d}"/>`, "Mesaverso");
const isotype = (t) => svg(32, 32, mark(t), "Mesaverso");
// App icon / favicon: the mark on an ink tile (keeps the dark-theme colours everywhere, incl. light browser tabs).
const tile = (size = 32, pad = 5) =>
  svg(32, 32, `<rect width="32" height="32" rx="7.5" fill="${C.tinta}"/><g transform="translate(${pad} ${pad}) scale(${(32 - 2 * pad) / 32})">${mark(THEMES.dark)}</g>`, "Mesaverso");

await mkdir(OUT, { recursive: true });
const files = {
  "logo-mesaverso.svg": lockup(THEMES.light), // master: colour, light backgrounds and print
  "logo-mesaverso-light.svg": lockup(THEMES.light), // explicit alias: for light backgrounds
  "logo-mesaverso-dark.svg": lockup(THEMES.dark), // for dark backgrounds
  "logo-mesaverso-black.svg": lockup(THEMES.black), // one colour, black print, stamps
  "logo-mesaverso-white.svg": lockup(THEMES.white), // one colour, reversed
  "wordmark-mesaverso.svg": wordmark(THEMES.light),
  "wordmark-mesaverso-dark.svg": wordmark(THEMES.dark),
  "isotype-mesaverso.svg": isotype(THEMES.light),
  "isotype-mesaverso-dark.svg": isotype(THEMES.dark),
  "isotype-mesaverso-mono.svg": isotype(THEMES.current), // takes the CSS colour (currentColor)
  "app-icon-mesaverso.svg": tile(),
};
for (const [name, content] of Object.entries(files)) await writeFile(path.join(OUT, name), content);
await writeFile(path.join(ROOT, "src/favicon.svg"), tile(32, 3.5));

// Inline <symbol>s for index.html (brand mark in the nav, footer and journey).
const sym = (id, t) => `<symbol id="${id}" viewBox="0 0 32 32">${mark(t)}</symbol>`;
const symWord = `<symbol id="b-word" viewBox="0 0 ${Math.ceil(WM.width + 1)} 32"><path fill="currentColor" d="${WM.d}"/></symbol>`;
await writeFile(path.join(OUT, "symbols.html"), [sym("b-mark", THEMES.dark), sym("b-mark-mono", THEMES.current), symWord].join("\n") + "\n");
console.log(`src/brand: ${Object.keys(files).length} files · lockup ${LOCKUP_W}×32 · wordmark ${WM.width.toFixed(1)} units`);
