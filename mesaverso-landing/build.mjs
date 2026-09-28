// Builds the static site into dist/: renders every page in src/content.mjs PAGES (shared partials,
// per-page SEO metadata, JSON-LD, FAQ), injects site.config.mjs values, fingerprints CSS/JS,
// writes robots.txt / sitemap.xml / _headers and copies assets.
//   node build.mjs                 production build (SITE_URL from site.config.mjs or env)
//   PREVIEW=1 node build.mjs       same site + noindex (meta and X-Robots-Tag) for preview deploys;
//                                  canonical/sitemap/schema still point to the stable SITE_URL.
import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MESAVERSO_WHATSAPP, PRICES, SITE_URL, WHATSAPP_MESSAGES, formatGs, waUrl } from "./site.config.mjs";
import { BUSINESS_TYPES } from "./src/lead-schema.js";
import { logoHtml } from "./scripts/brand.mjs";
import { BRAND, FAQS, PAGES } from "./src/content.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");
const PREVIEW = process.env.PREVIEW === "1";
if (!/^https:\/\/[^/]+$/.test(SITE_URL) || /localhost|127\.0\.0\.1/.test(SITE_URL)) throw new Error(`SITE_URL must be the stable public origin, got ${SITE_URL}`);

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

const waDisplay = `+${MESAVERSO_WHATSAPP.slice(0, 3)} ${MESAVERSO_WHATSAPP.slice(3, 6)} ${MESAVERSO_WHATSAPP.slice(6, 9)} ${MESAVERSO_WHATSAPP.slice(9)}`;
const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const stripHtml = (s) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const abs = (p) => SITE_URL + p;
const OG_IMAGE = abs("/assets/og.png");

/* ---------- structured data (schema.org JSON-LD) ----------
   Only types that describe Mesaverso exactly: Organization, WebSite, WebPage, Service (the menu
   is sold as a managed service with set-up, not as downloadable software), FAQPage (mirrors the
   visible FAQ) and BreadcrumbList on inner pages. No LocalBusiness (no public address), no
   ratings or reviews. */
const ORG = `${SITE_URL}/#organization`;
const SITE = `${SITE_URL}/#website`;
const SERVICE = `${SITE_URL}/#service`;
const recurring = (name, key, unitText, unitCode) => ({
  "@type": "Offer", name, price: String(PRICES[key]), priceCurrency: "PYG", url: abs("/#planes"),
  priceSpecification: { "@type": "UnitPriceSpecification", price: PRICES[key], priceCurrency: "PYG", unitText, referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode } },
});
const serviceNode = {
  "@type": "Service", "@id": SERVICE, name: "Mesaverso",
  serviceType: "Menú digital interactivo para restaurantes y negocios gastronómicos",
  description: "Menú digital con QR y link directo: los clientes buscan productos, arman su pedido y lo envían por WhatsApp al negocio o se lo muestran al mozo. Sin comisión por pedido. Platos en 3D opcionales, con un pago único por plato.",
  provider: { "@id": ORG },
  areaServed: { "@type": "Country", name: "Paraguay" },
  audience: { "@type": "BusinessAudience", audienceType: "Restaurantes y negocios gastronómicos" },
  offers: [
    recurring(`Plan mensual (mínimo ${PRICES.minMonths} meses)`, "planMonthly", "mes", "MON"),
    recurring("Plan anual (pago por adelantado, implementación incluida)", "planAnnual", "año", "ANN"),
    { "@type": "Offer", name: "Implementación (pago único; incluida en el plan anual)", price: String(PRICES.implementation), priceCurrency: "PYG", url: abs("/#implementacion") },
    { "@type": "Offer", name: "Pack 3D (pago único por plato)", price: String(PRICES.pack3dDish), priceCurrency: "PYG", url: abs("/#pack-3d") },
  ],
};
function jsonLd(page) {
  const url = abs(page.path);
  const graph = [
    {
      "@type": "Organization", "@id": ORG, name: "Mesaverso", url: abs("/"),
      logo: { "@type": "ImageObject", url: abs("/assets/icon-512.png"), width: 512, height: 512 },
      contactPoint: { "@type": "ContactPoint", telephone: `+${MESAVERSO_WHATSAPP}`, contactType: "sales", areaServed: "PY", availableLanguage: ["es"] },
    },
    { "@type": "WebSite", "@id": SITE, name: "Mesaverso", url: abs("/"), inLanguage: "es-PY", publisher: { "@id": ORG } },
    {
      "@type": "WebPage", "@id": `${url}#webpage`, url, name: page.title, description: page.description, inLanguage: "es-PY",
      isPartOf: { "@id": SITE }, about: { "@id": SERVICE }, primaryImageOfPage: { "@type": "ImageObject", url: OG_IMAGE },
      ...(page.path === "/" ? {} : { breadcrumb: { "@id": `${url}#breadcrumb` } }),
    },
    serviceNode,
  ];
  if (page.path !== "/") graph.push({
    "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: abs("/") },
      { "@type": "ListItem", position: 2, name: page.crumb, item: url },
    ],
  });
  if (page.faq) graph.push({
    "@type": "FAQPage", "@id": `${url}#faq`,
    mainEntity: FAQS[page.faq].map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: stripHtml(a) } })),
  });
  // "<" is escaped so no string can close the script element.
  return `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c")}</script>`;
}

function headMeta(page) {
  const url = abs(page.path);
  const e = (s) => escapeHtml(s);
  return [
    `<title>${e(page.title)}</title>`,
    `<meta name="description" content="${e(page.description)}">`,
    PREVIEW ? `<meta name="robots" content="noindex, nofollow">` : `<meta name="robots" content="index, follow, max-image-preview:large">`,
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:locale" content="es_PY">`,
    `<meta property="og:site_name" content="Mesaverso">`,
    `<meta property="og:title" content="${e(page.ogTitle || page.title)}">`,
    `<meta property="og:description" content="${e(page.ogDescription || page.description)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${OG_IMAGE}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="Mesaverso: ${e(BRAND.secondary)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${e(page.ogTitle || page.title)}">`,
    `<meta name="twitter:description" content="${e(page.ogDescription || page.description)}">`,
    `<meta name="twitter:image" content="${OG_IMAGE}">`,
    jsonLd(page),
  ].join("\n");
}

// Accessible accordion: <button aria-expanded> + region. Answers are in the HTML; app.js collapses them.
const faqHtml = (set) => `<div class="faq__list" data-faq>\n${FAQS[set].map(([q, a], i) => {
  const id = `${set}-${i + 1}`;
  return `<div class="faq__item"><h3 class="faq__h"><button type="button" class="faq__q" id="faq-q-${id}" aria-expanded="false" aria-controls="faq-a-${id}">${q}</button></h3><div class="faq__a" id="faq-a-${id}" role="region" aria-labelledby="faq-q-${id}">${a}</div></div>`;
}).join("\n")}\n</div>`;

const partials = {};
for (const f of await readdir(path.join(SRC, "partials"))) partials[f.replace(/\.html$/, "")] = await readFile(path.join(SRC, "partials", f), "utf8");

function render(template, page) {
  const withIncludes = template.replace(/\{\{INCLUDE:([a-z-]+)\}\}/g, (m, name) => {
    if (!(name in partials)) throw new Error(`Unknown partial ${name}`);
    return partials[name];
  });
  const out = withIncludes.replace(/\{\{([A-Za-z_]+)(?::([A-Za-z0-9_.]+))?\}\}/g, (m, key, arg) => {
    switch (key) {
      case "HEAD_META": return headMeta(page);
      case "FAQ": if (!FAQS[arg]) throw new Error(`Unknown FAQ ${arg}`); return faqHtml(arg);
      case "SITE_URL": return SITE_URL;
      case "wa": return escapeHtml(waUrl(arg));
      case "price": if (!(arg in PRICES)) throw new Error(`Unknown price ${arg}`); return formatGs(PRICES[arg]);
      case "RAW": if (!(arg in PRICES)) throw new Error(`Unknown price ${arg}`); return String(PRICES[arg]);
      case "HASH": return hash(arg);
      case "LOGO": return logoHtml({ animated: arg === "animated" });
      case "WA_DISPLAY": return waDisplay;
      case "YEAR": return String(new Date().getFullYear());
      case "BUSINESS_OPTIONS": return BUSINESS_TYPES.map((t) => `<option>${escapeHtml(t)}</option>`).join("");
      default: throw new Error(`Unknown placeholder ${m}`);
    }
  });
  if (/\{\{/.test(out)) throw new Error(`Unreplaced placeholder left in ${page.file}`);
  return out;
}

for (const page of PAGES) {
  const html = render(await readFile(path.join(SRC, page.file), "utf8"), page);
  const out = page.path === "/" ? path.join(DIST, "index.html") : path.join(DIST, page.path, "index.html");
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, html);
}

// Small utility pages (not indexable) share the main stylesheet.
const page = (title, body) => `<!doctype html><html lang="es-PY"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} | Mesaverso</title><meta name="robots" content="noindex"><meta name="theme-color" content="#0e1014"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="preload" href="/fonts/familjen-grotesk-latin.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/styles.css?v=${hash("styles.css")}"></head><body><main class="section final"><div class="wrap final__in"><a class="brand" href="/" aria-label="Mesaverso, ir al inicio" style="font-size:26px">${logoHtml()}</a>${body}</div></main></body></html>`;
await writeFile(path.join(DIST, "gracias.html"), page("Solicitud recibida", `<h1>¡Listo! Recibimos tu solicitud.</h1><p class="sec-lead">Te vamos a escribir por WhatsApp para coordinar la demo.</p><div class="final__ctas"><a class="btn btn--primary btn--lg" href="/">Volver a Mesaverso</a></div>`));
await writeFile(path.join(DIST, "404.html"), page("Página no encontrada", `<h1>No encontramos esta página.</h1><p class="sec-lead">Puede que el enlace haya cambiado.</p><div class="final__ctas"><a class="btn btn--primary btn--lg" href="/">Ir al inicio</a><a class="btn btn--secondary btn--lg" href="${escapeHtml(waUrl("general"))}" target="_blank" rel="noopener">Hablar por WhatsApp</a></div>`));

await cp(path.join(SRC, "assets"), path.join(DIST, "assets"), { recursive: true });
await cp(path.join(SRC, "fonts"), path.join(DIST, "fonts"), { recursive: true });
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

// robots.txt: everything public is crawlable (CSS, JS, images included); only the form API is not.
await writeFile(path.join(DIST, "robots.txt"), PREVIEW
  ? "User-agent: *\nDisallow: /\n"
  : `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
const today = new Date().toISOString().slice(0, 10);
await writeFile(path.join(DIST, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES.map((p) => `  <url><loc>${abs(p.path)}</loc><lastmod>${today}</lastmod></url>`).join("\n")}
</urlset>
`);

// Cloudflare static-asset headers. CSP: only this origin (fonts are self-hosted); wa.me is a plain link.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
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
  X-Frame-Options: DENY${PREVIEW ? "\n  X-Robots-Tag: noindex, nofollow" : ""}
/gracias
  X-Robots-Tag: noindex
/styles.css
  Cache-Control: public, max-age=31536000, immutable
/app.js
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

console.log(`Built dist/ for ${SITE_URL}${PREVIEW ? " (PREVIEW: noindex)" : ""} · ${PAGES.length} pages · WhatsApp ${waDisplay} · ${Object.keys(WHATSAPP_MESSAGES).length} messages`);
