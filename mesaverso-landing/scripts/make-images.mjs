// Renders the Open Graph image (1200×630) and the PNG icons (32, 180, 512) from the brand SVGs
// (src/brand, made by `npm run brand`) with the real fonts, using the locally installed Chrome.
// Output goes to src/assets/ (committed). Run: npm run images
import { chromium } from "playwright-core";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brand = (f) => readFile(path.join(ROOT, "src/brand", f), "utf8");
const logo = await brand("logo-mesaverso-dark.svg");
const appIcon = await brand("app-icon-mesaverso.svg");
const favicon = await readFile(path.join(ROOT, "src/favicon.svg"), "utf8");
const fonts = `<link href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@600;700&family=IBM+Plex+Mono:wght@500&display=block" rel="stylesheet">`;

// Manual 5B §10: Noche background, main logo [M]ESAVERSO centred + tagline. No gradients.
const og = `<!doctype html><html><head>${fonts}<style>
body{margin:0;width:1200px;height:630px;background:#0e1014;color:#f1f2ee;display:grid;place-content:center;justify-items:center;gap:44px;text-align:center}
.l svg{height:92px;width:auto;display:block}
h1{margin:0;font:700 64px/1.05 "Familjen Grotesk";letter-spacing:-.02em}
p{margin:0;font:500 20px "IBM Plex Mono";letter-spacing:.1em;text-transform:uppercase;color:#c3c8ce}</style></head>
<body><div class="l">${logo}</div><h1>Tus pedidos, directo. Sin comisiones.</h1><p>Menú digital · Pedidos por WhatsApp · Platos 3D</p></body></html>`;
// Full-bleed tiles for PNGs (iOS and launchers round the corners themselves); 32px keeps the favicon's rounding.
const icon = (px, svg, square) => `<!doctype html><html><body style="margin:0;width:${px}px;height:${px}px;background:${square ? "#0e1014" : "transparent"}">${(square ? svg.replace('rx="23"', 'rx="0"') : svg).replace("<svg ", `<svg width="${px}" height="${px}" `)}</body></html>`;

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(og, { waitUntil: "networkidle" });
await page.screenshot({ path: path.join(ROOT, "src/assets/og.png") });
for (const [px, file, svg, square] of [[32, "icon-32.png", favicon, false], [180, "apple-touch-icon.png", appIcon, true], [512, "icon-512.png", appIcon, true]]) {
  await page.setViewportSize({ width: px, height: px });
  await page.setContent(icon(px, svg, square));
  await page.screenshot({ path: path.join(ROOT, "src/assets", file), omitBackground: !square });
}
await browser.close();
console.log("src/assets/og.png, icon-32.png, apple-touch-icon.png, icon-512.png");
