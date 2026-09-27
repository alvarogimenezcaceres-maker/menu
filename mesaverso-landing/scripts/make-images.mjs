// Renders the Open Graph image (1200×630), the Apple touch icon (180) and the 512 px app/social
// icon from the brand SVGs (src/brand, made by `npm run brand`) with the real fonts, using the
// locally installed Chrome. Output goes to src/assets/ (committed). Run: npm run images
import { chromium } from "playwright-core";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const torta = (await readFile(path.join(ROOT, "src/assets/torta-3d.webp"))).toString("base64");
const brand = (f) => readFile(path.join(ROOT, "src/brand", f), "utf8");
const lockup = await brand("logo-mesaverso-dark.svg");
const appIcon = await brand("app-icon-mesaverso.svg");
const fonts = `<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,500&family=Instrument+Sans:wght@400;700&display=block" rel="stylesheet">`;
// Same outline as --fold-m in styles.css: the logo's M, huge and faint, as the stage for the dish.
const foldM = "polygon(0 0, 26.92% 0, 50% 37.27%, 73.08% 0, 100% 0, 100% 100%, 73.08% 100%, 73.08% 44.55%, 50% 81.82%, 26.92% 44.55%, 26.92% 100%, 0 100%)";

const og = `<!doctype html><html><head>${fonts}<style>
body{margin:0;width:1200px;height:630px;background:#0a0c15;color:#f3f5fb;font-family:"Instrument Sans";display:flex;align-items:center;overflow:hidden;position:relative}
.m{position:absolute;right:30px;top:70px;width:560px;aspect-ratio:26/22;clip-path:${foldM};background:linear-gradient(90deg,rgba(58,91,240,.22) 0 26.92%,rgba(157,176,255,.09) 26.92% 73.08%,rgba(58,91,240,.22) 73.08%)}
.t{position:relative;padding-left:80px;width:660px}.b svg{height:52px;width:auto;display:block}
h1{font-size:86px;line-height:1;margin:40px 0 26px;letter-spacing:-.035em;font-weight:700}em{font-family:Fraunces;font-weight:500;display:block;color:#9db0ff}
p{font-size:27px;color:#b5bcd6;margin:0;max-width:540px}p b{color:#ffb547;font-weight:700}
img{position:absolute;right:70px;top:120px;width:470px;filter:drop-shadow(0 40px 50px rgba(0,0,0,.6))}</style></head>
<body><div class="m"></div><img src="data:image/webp;base64,${torta}"><div class="t"><div class="b">${lockup}</div><h1>Tu menú. <em>Ahora en otra dimensión.</em></h1><p>Tus clientes piden desde donde estén, <b>directo a tu WhatsApp.</b></p></div></body></html>`;
const icon = (px) => `<!doctype html><html><body style="margin:0;width:${px}px;height:${px}px;background:#0a0c15">${appIcon.replace("<svg ", `<svg width="${px}" height="${px}" `).replace('rx="7.5"', 'rx="0"')}</body></html>`;

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(og, { waitUntil: "networkidle" });
await page.screenshot({ path: path.join(ROOT, "src/assets/og.png") });
for (const [px, file] of [[180, "apple-touch-icon.png"], [512, "icon-512.png"]]) {
  await page.setViewportSize({ width: px, height: px });
  await page.setContent(icon(px));
  await page.screenshot({ path: path.join(ROOT, "src/assets", file) });
}
await browser.close();
console.log("src/assets/og.png, apple-touch-icon.png, icon-512.png");
