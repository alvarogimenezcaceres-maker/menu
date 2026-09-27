// Builds the static landing into dist/: injects site.config.mjs values into the HTML, renders the
// QR (it encodes SITE_URL, so it changes with the domain), fingerprints CSS/JS and copies assets.
//   node build.mjs            (SITE_URL=https://… node build.mjs for another public URL)
import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { MESAVERSO_WHATSAPP, PRICES, SITE_URL, WHATSAPP_MESSAGES, formatGs, waUrl } from "./site.config.mjs";
import { BUSINESS_TYPES } from "./src/lead-schema.js";
import { logoHtml } from "./scripts/brand.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");

// Empty dist/ instead of deleting it: `wrangler dev` keeps the folder open on Windows.
await mkdir(DIST, { recursive: true });
for (const f of await readdir(DIST)) await rm(path.join(DIST, f), { recursive: true, force: true });
await mkdir(path.join(DIST, "vendor"), { recursive: true });

const files = {};
for (const f of ["styles.css", "app.js"]) {
  files[f] = await readFile(path.join(SRC, f), "utf8");
  await writeFile(path.join(DIST, f), files[f]);
}
const hash = (f) => createHash("sha256").update(files[f]).digest("hex").slice(0, 10);

const qrSvg = (await QRCode.toString(`${SITE_URL}/`, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0e1014", light: "#0000" } }))
  .replace("<svg ", '<svg role="img" aria-label="Código QR de ejemplo" ')
  .replace(/\n/g, "");

const waDisplay = `+${MESAVERSO_WHATSAPP.slice(0, 3)} ${MESAVERSO_WHATSAPP.slice(3, 6)} ${MESAVERSO_WHATSAPP.slice(6, 9)} ${MESAVERSO_WHATSAPP.slice(9)}`;
const discount = Math.round((1 - PRICES.implementationPromo / PRICES.implementationOriginal) * 100);
const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const html = (await readFile(path.join(SRC, "index.html"), "utf8")).replace(/\{\{([A-Za-z_]+)(?::([A-Za-z0-9_.]+))?\}\}/g, (m, key, arg) => {
  switch (key) {
    case "SITE_URL": return SITE_URL;
    case "wa": return escapeHtml(waUrl(arg));
    case "price": if (!(arg in PRICES)) throw new Error(`Unknown price ${arg}`); return formatGs(PRICES[arg]);
    case "RAW": if (!(arg in PRICES)) throw new Error(`Unknown price ${arg}`); return String(PRICES[arg]);
    case "HASH": return hash(arg);
    case "QR_SVG": return qrSvg;
    case "LOGO": return logoHtml({ animated: arg === "animated" });
    case "WA_DISPLAY": return waDisplay;
    case "DISCOUNT": return String(discount);
    case "YEAR": return String(new Date().getFullYear());
    case "BUSINESS_OPTIONS": return BUSINESS_TYPES.map((t) => `<option>${escapeHtml(t)}</option>`).join("");
    default: throw new Error(`Unknown placeholder ${m}`);
  }
});
if (/\{\{/.test(html)) throw new Error("Unreplaced placeholder left in index.html");
await writeFile(path.join(DIST, "index.html"), html);

// Small static pages share the main stylesheet.
const page = (title, body) => `<!doctype html><html lang="es-PY"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} | Mesaverso</title><meta name="robots" content="noindex"><meta name="theme-color" content="#0e1014"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@600;700&family=Instrument+Sans:wght@400;500;600&display=swap"><link rel="stylesheet" href="/styles.css?v=${hash("styles.css")}"></head><body><main class="section final"><div class="wrap final__in"><a class="brand" href="/" aria-label="Mesaverso, ir al inicio" style="font-size:26px">${logoHtml()}</a>${body}</div></main></body></html>`;
await writeFile(path.join(DIST, "gracias.html"), page("Solicitud recibida", `<h1>¡Listo! Recibimos tu solicitud.</h1><p class="sec-lead">Te vamos a escribir por WhatsApp para coordinar la demo.</p><div class="final__ctas"><a class="btn btn--primary btn--lg" href="/">Volver a Mesaverso</a></div>`));
await writeFile(path.join(DIST, "404.html"), page("Página no encontrada", `<h1>No encontramos esta página.</h1><p class="sec-lead">Puede que el enlace haya cambiado.</p><div class="final__ctas"><a class="btn btn--primary btn--lg" href="/">Ir al inicio</a><a class="btn btn--secondary btn--lg" href="${escapeHtml(waUrl("general"))}" target="_blank" rel="noopener">Hablar por WhatsApp</a></div>`));

await cp(path.join(SRC, "assets"), path.join(DIST, "assets"), { recursive: true });
await cp(path.join(SRC, "favicon.svg"), path.join(DIST, "favicon.svg"));
// Public logo files (e.g. /brand/logo-mesaverso.svg) for social profiles, PDFs and QR material.
await cp(path.join(SRC, "brand"), path.join(DIST, "brand"), { recursive: true });
await cp(path.join(ROOT, "node_modules/@google/model-viewer/dist/model-viewer.min.js"), path.join(DIST, "vendor/model-viewer.min.js"));

// Web app manifest (installable icon, theme colour Noche).
await writeFile(path.join(DIST, "site.webmanifest"), JSON.stringify({
  name: "Mesaverso", short_name: "Mesaverso", start_url: "/", display: "browser",
  background_color: "#0e1014", theme_color: "#0e1014",
  icons: [
    { src: "/assets/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/assets/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    { src: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
  ],
}, null, 2) + "\n");
await writeFile(path.join(DIST, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${SITE_URL}/sitemap.xml\n`);
await writeFile(path.join(DIST, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE_URL}/</loc></url></urlset>\n`);

// Cloudflare static-asset headers. CSP allows only this origin plus Google Fonts; wa.me is a plain link.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join("; ");
await writeFile(path.join(DIST, "_headers"), `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), xr-spatial-tracking=(self)
  X-Frame-Options: DENY
/styles.css
  Cache-Control: public, max-age=31536000, immutable
/app.js
  Cache-Control: public, max-age=31536000, immutable
/assets/*
  Cache-Control: public, max-age=604800
/brand/*
  Cache-Control: public, max-age=86400
/vendor/*
  Cache-Control: public, max-age=604800
`);

console.log(`Built dist/ for ${SITE_URL} · WhatsApp ${waDisplay} · ${Object.keys(WHATSAPP_MESSAGES).length} messages`);
