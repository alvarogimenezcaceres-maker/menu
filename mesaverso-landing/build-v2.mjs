// Builds the NEW landing (v2, «La noche sin papelitos») into dist-v2/. It never touches dist/ nor src/, so the live
// landing and the uncommitted edits in src/ stay as they are. It reuses site.config.mjs (WhatsApp, prices, SITE_URL),
// src/lead-schema.js (business types), the fonts, brand files and assets of src/, and the same Worker (src/worker.js,
// POST /api/lead) through wrangler.v2.jsonc.
//   node build-v2.mjs                 preview build: noindex, owner data may still be «[completar …]»
//   PUBLISH=1 node build-v2.mjs       production build: indexable; refuses to build while owner data is incomplete
// Preview:  npm run dev:v2   (wrangler on port 8789).  Deploy: only with the owner's OK (see plan/landing-2026/ita.md).
import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { MESAVERSO_WHATSAPP, PRICES, SITE_URL, formatGs, waUrl } from "./site.config.mjs";
import { BUSINESS_TYPES } from "./src/lead-schema.js";
import { FAQ } from "./src-v2/faq.mjs";
import { OWNER, ownerPending } from "./src-v2/owner.config.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, "src");
const SRC2 = path.join(ROOT, "src-v2");
const DIST = path.join(ROOT, "dist-v2");
const PUBLISH = process.env.PUBLISH === "1";
if (!/^https:\/\/[^/]+$/.test(SITE_URL) || /localhost|127\.0\.0\.1/.test(SITE_URL)) throw new Error(`SITE_URL must be the stable public origin, got ${SITE_URL}`);
if (PUBLISH && ownerPending().length) throw new Error(`PUBLISH=1 needs the owner data (${ownerPending().join(", ")}); see src-v2/owner.config.mjs`);

// Empty dist-v2/ instead of deleting it: `wrangler dev` keeps the folder open on Windows.
await mkdir(DIST, { recursive: true });
for (const f of await readdir(DIST)) await rm(path.join(DIST, f), { recursive: true, force: true });
await mkdir(path.join(DIST, "vendor"), { recursive: true });

const css = (await readFile(path.join(SRC2, "v2.css"), "utf8")) + "\n" + (await readFile(path.join(SRC2, "v2-sections.css"), "utf8"));
const js = await readFile(path.join(SRC2, "v2.js"), "utf8");
await writeFile(path.join(DIST, "v2.css"), css);
await writeFile(path.join(DIST, "v2.js"), js);
await mkdir(path.join(DIST, "m"), { recursive: true });
const mods = {};
for (const f of await readdir(path.join(SRC2, "m"))) { const code = await readFile(path.join(SRC2, "m", f), "utf8"); await writeFile(path.join(DIST, "m", f), code); mods["m/" + f] = createHash("sha256").update(code).digest("hex").slice(0, 10); }
const hashes = { ...mods, "v2.css": createHash("sha256").update(css).digest("hex").slice(0, 10), "v2.js": createHash("sha256").update(js).digest("hex").slice(0, 10) };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const abs = (p) => SITE_URL + p;
const waDisplay = `+${MESAVERSO_WHATSAPP.slice(0, 3)} ${MESAVERSO_WHATSAPP.slice(3, 6)} ${MESAVERSO_WHATSAPP.slice(6, 9)} ${MESAVERSO_WHATSAPP.slice(9)}`;
const qr3d = await QRCode.toString(abs("/#plato-3d"), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0e1014", light: "#ffffff" } });
const faqHtml = FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><div>${a}</div></details>`).join("\n");
const plain = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const TITLE = "Menú digital QR, pedidos y caja para restaurantes | Mesaverso";
const DESC = "Menú con QR, pedidos por WhatsApp y caja para tu salón: cocina, cuenta dividida y platos en 3D. 0 % de comisión en pedidos por tu link o QR. Paraguay.";
const OG_TITLE = "Mesaverso: la noche sin papelitos";
const OG_DESC = "Menú con QR, pedidos, cocina y cuenta dividida en tu local. Tu cliente mira el plato en 3D. 0 % de comisión en los pedidos por tu link o QR.";

function headMeta({ title, description, pathname, noindex }) {
  const url = abs(pathname);
  const graph = [
    { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "Mesaverso", url: abs("/"), logo: abs("/assets/icon-512.png") },
    { "@type": "WebSite", "@id": `${SITE_URL}/#website`, name: "Mesaverso", url: abs("/"), inLanguage: "es-PY", publisher: { "@id": `${SITE_URL}/#organization` } },
    ...(pathname === "/" ? [{ "@type": "FAQPage", mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: plain(a) } })) }] : []),
  ];
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${url}">`,
    noindex || !PUBLISH ? `<meta name="robots" content="noindex, nofollow">` : `<meta name="robots" content="index, follow">`,
    `<meta property="og:type" content="website"><meta property="og:locale" content="es_PY"><meta property="og:site_name" content="Mesaverso">`,
    `<meta property="og:title" content="${esc(pathname === "/" ? OG_TITLE : title)}"><meta property="og:description" content="${esc(pathname === "/" ? OG_DESC : description)}"><meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${abs("/assets/og-v2.png")}"><meta name="twitter:card" content="summary_large_image">`,
    `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph })}</script>`,
  ].join("\n");
}

function render(template, meta) {
  const out = template.replace(/\{\{([A-Za-z_0-9]+)(?::([A-Za-z0-9_./]+))?\}\}/g, (m, key, arg) => {
    switch (key) {
      case "HEAD_META": return headMeta(meta);
      case "HASH": if (!hashes[arg]) throw new Error(`Unknown hash ${arg}`); return hashes[arg];
      case "WA": return esc(waUrl(arg));
      case "PRICE": if (!(arg in PRICES)) throw new Error(`Unknown price ${arg}`); return formatGs(PRICES[arg]);
      case "RAW": if (!(arg in PRICES)) throw new Error(`Unknown price ${arg}`); return String(PRICES[arg]);
      case "OWNER": if (!(arg in OWNER)) throw new Error(`Unknown owner field ${arg}`); return esc(OWNER[arg]);
      case "WA_DISPLAY": return waDisplay;
      case "YEAR": return String(new Date().getFullYear());
      case "QR3D": return qr3d;
      case "FAQ": return faqHtml;
      case "BUSINESS_OPTIONS": return BUSINESS_TYPES.map((t) => `<option${t === "Restaurante" ? " selected" : ""}>${esc(t)}</option>`).join("");
      default: throw new Error(`Unknown placeholder ${m}`);
    }
  });
  if (/\{\{/.test(out)) throw new Error("Unreplaced placeholder");
  return out;
}

const write = async (rel, html) => { const f = path.join(DIST, rel); await mkdir(path.dirname(f), { recursive: true }); await writeFile(f, html); };
await write("index.html", render(await readFile(path.join(SRC2, "index.html"), "utf8"), { title: TITLE, description: DESC, pathname: "/" }));

// Legal and small pages share the page shell. They are drafts until a licensed lawyer reviews them.
const draft = PUBLISH ? "" : `<p class="draft"><b>Borrador para revisión.</b> Este texto lo redactó una asistente de IA y todavía no lo revisó un abogado matriculado. No publicar así.</p>`;
const shell = (title, body) => `<!doctype html><html lang="es-PY" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">{{HEAD_META}}<meta name="theme-color" content="#0e1014"><meta name="color-scheme" content="dark light"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="preload" href="/fonts/familjen-grotesk-latin.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/v2.css?v={{HASH:v2.css}}"></head><body><nav class="nav" aria-label="Principal"><div class="wrap nav__in"><a class="mv-wordmark" href="/" aria-label="Mesaverso, volver al inicio"><svg viewBox="0 0 100 100" aria-hidden="true"><path class="m" d="M16 80V22L50 60L84 22V80"/><circle class="a" cx="16" cy="82" r="10"/><circle class="b" cx="84" cy="82" r="10"/></svg>ESAVERSO</a><a class="btn btn--secondary btn--sm" href="/">Volver al inicio</a></div></nav><main class="wrap legal"><h1>${title}</h1>${draft}${body}</main><script>if(matchMedia('(prefers-color-scheme: light)').matches)document.documentElement.dataset.theme='light'</script></body></html>`;
const pages = [
  ["privacidad", "Aviso de privacidad", "Cómo usamos los datos que dejás en esta página.", "privacidad.body.html"],
  ["terminos", "Términos del sitio", "Condiciones de uso de la página de Mesaverso.", "terminos.body.html"],
  ["reclamos", "Reclamos y retiro de contenido", "Cómo pedir que retiremos un contenido o avisarnos de una suplantación.", "reclamos.body.html"],
];
for (const [slug, title, description, file] of pages) {
  const body = (await readFile(path.join(SRC2, file), "utf8")).replace("{{OWNER:VIGENCIA}}", esc(OWNER.VIGENCIA));
  const intro = slug === "privacidad" ? `<p class="fine">Versión LP-1 · vigente desde ${esc(OWNER.VIGENCIA)}</p>` : "";
  await write(`${slug}/index.html`, render(shell(esc(title), intro + body), { title: `${title} | Mesaverso`, description, pathname: `/${slug}/` }));
}
const simple = (title, text) => render(shell(esc(title), `<p>${text}</p><p><a class="btn btn--primary" href="/">Volver a Mesaverso</a></p>`), { title: `${title} | Mesaverso`, description: title, pathname: "/", noindex: true });
await write("gracias.html", simple("¡Listo! Recibimos tu solicitud", "Te vamos a escribir por WhatsApp para mostrarte cómo quedaría tu menú."));
await write("404.html", simple("No encontramos esta página", "Puede que el enlace haya cambiado."));

await cp(path.join(SRC, "assets"), path.join(DIST, "assets"), { recursive: true });
await cp(path.join(SRC2, "assets"), path.join(DIST, "assets"), { recursive: true });
await cp(path.join(SRC, "fonts"), path.join(DIST, "fonts"), { recursive: true });
await cp(path.join(SRC, "favicon.svg"), path.join(DIST, "favicon.svg"));
await cp(path.join(SRC, "brand"), path.join(DIST, "brand"), { recursive: true });
await cp(path.join(ROOT, "node_modules/@google/model-viewer/dist/model-viewer.min.js"), path.join(DIST, "vendor/model-viewer.min.js"));

await write("robots.txt", PUBLISH ? `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n` : "User-agent: *\nDisallow: /\n");
const today = new Date().toISOString().slice(0, 10);
await write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${["/", ...pages.map((p) => `/${p[0]}/`)].map((p) => `  <url><loc>${abs(p)}</loc><lastmod>${today}</lastmod></url>`).join("\n")}\n</urlset>\n`);

// Same security headers as the live landing. wa.me links are plain anchors; no third-party script or font.
const csp = ["default-src 'self'", "script-src 'self' 'wasm-unsafe-eval'", "style-src 'self' 'unsafe-inline'", "font-src 'self'", "img-src 'self' data: blob:", "connect-src 'self' blob: data:", "worker-src 'self' blob:", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "object-src 'none'"].join("; ");
await write("_headers", `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), xr-spatial-tracking=(self)
  X-Frame-Options: DENY${PUBLISH ? "" : "\n  X-Robots-Tag: noindex, nofollow"}
/gracias
  X-Robots-Tag: noindex
/v2.css
  Cache-Control: public, max-age=31536000, immutable
/v2.js
  Cache-Control: public, max-age=31536000, immutable
/m/*
  Cache-Control: public, max-age=31536000, immutable
/fonts/*
  Cache-Control: public, max-age=31536000, immutable
/assets/*
  Cache-Control: public, max-age=604800
/brand/*
  Cache-Control: public, max-age=86400
/vendor/*
  Cache-Control: public, max-age=604800
`);
console.log(`Built dist-v2/ for ${SITE_URL}${PUBLISH ? " (PUBLISH)" : " (preview: noindex)"} · owner data pending: ${ownerPending().length ? ownerPending().join(", ") : "none"}`);
