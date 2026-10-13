// Builds the NEW landing (v2, «Tu local atiende. Mesaverso ordena.») into dist-v2/. It never touches dist/ nor src/, so the live
// landing and the uncommitted edits in src/ stay as they are. It reuses site.config.mjs (WhatsApp, prices, SITE_URL),
// src/lead-schema.js (business types), the fonts, brand files and assets of src/, and the same Worker (src/worker.js,
// POST /api/lead) through wrangler.v2.jsonc.
//   node build-v2.mjs                 preview build: noindex, owner data may still be «[completar …]»
//   PUBLISH=1 node build-v2.mjs       production build: indexable; refuses to build while owner data is incomplete
// Preview:  npm run dev:v2   (wrangler on port 8789).  Deploy: only with the owner's OK (see plan/landing-2026/ita.md).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { MESAVERSO_WHATSAPP, PRICES, SITE_URL, formatGs, waUrl } from "./site.config.mjs";
import { BUSINESS_TYPES, CITIES, PRODUCT_RANGES, PLACES, INTERESTS, HOWS } from "./src/lead-schema.js";
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
// Brand mark: the warm dot rests at the right foot of the M, jumps to the left foot and traces the M every 8 s (same motion as src/brand/isotype-mesaverso-animated.svg)
const MARK_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true"><path class="m" d="M16 80V22L50 60L84 22V80"/><circle class="a" cx="16" cy="82" r="10"/><circle class="b" cx="0" cy="0" r="10"><animateMotion dur="8s" repeatCount="indefinite" calcMode="spline" path="M16 82V22L50 60L84 22V82" keyPoints="1;1;0;0;1;1" keyTimes="0;0.62;0.64;0.7;0.925;1" keySplines="0 0 1 1;0 0 1 1;0 0 1 1;0.65 0 0.35 1;0 0 1 1"/><animate attributeName="opacity" dur="8s" repeatCount="indefinite" values="1;1;0;0;1;1" keyTimes="0;0.6;0.63;0.66;0.7;1"/></circle></svg>`;
const abs = (p) => SITE_URL + p;
const opts = (list) => `<option value="">Elegí una opción</option>` + list.map((t) => `<option>${esc(t)}</option>`).join("");
const waDisplay = `+${MESAVERSO_WHATSAPP.slice(0, 3)} ${MESAVERSO_WHATSAPP.slice(3, 6)} ${MESAVERSO_WHATSAPP.slice(6, 9)} ${MESAVERSO_WHATSAPP.slice(9)}`;
const qr3d = await QRCode.toString(abs("/#plato-3d"), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0e1014", light: "#ffffff" } });
const faqHtml = FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><div>${a}</div></details>`).join("\n");
const plain = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const TITLE = "Mesaverso: menú QR, pedidos y cocina para locales en Paraguay";
const DESC = "Menú digital con QR, pedidos por WhatsApp y caja para tu local en Paraguay. 0 % de comisión en los pedidos que llegan por tu link o QR.";
const OG_TITLE = "Tu local atiende. Mesaverso ordena.";
const OG_DESC = "Menú con QR, pedidos, cocina y cuenta dividida en tu local. Tu cliente mira el plato en 3D. 0 % de comisión en los pedidos por tu link o QR.";

function headMeta({ title, description, pathname, noindex, extra = [], pageType = "WebPage" }) {
  const url = abs(pathname);
  const graph = [
    { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "Mesaverso", url: abs("/"), logo: abs("/assets/icon-512.png"), slogan: "Tu local atiende. Mesaverso ordena.", description: "Mesaverso es un servicio de menú digital con QR, pedidos por WhatsApp, cocina en pantalla y cuenta dividida para restaurantes, bares, lomiterías y cafeterías de Paraguay.", disambiguatingDescription: "Servicio paraguayo para locales gastronómicos. No es un metaverso ni una app de delivery.", knowsAbout: ["menú digital con QR", "pedidos por WhatsApp", "comanda de cocina", "cuenta dividida", "delivery propio"], areaServed: { "@type": "Country", name: "Paraguay" }, contactPoint: { "@type": "ContactPoint", contactType: "sales", telephone: `+${MESAVERSO_WHATSAPP}`, email: "contacto@mesaverso.app", availableLanguage: ["es"], areaServed: "PY" } },
    ...(pathname === "/" ? [{ "@type": "SoftwareApplication", "@id": `${SITE_URL}/#software`, name: "Mesaverso", applicationCategory: "BusinessApplication", operatingSystem: "Web", inLanguage: "es-PY", url: abs("/"), publisher: { "@id": `${SITE_URL}/#organization` },
      description: "Menú digital con QR, pedidos por WhatsApp y caja (mesas, cocina, cuenta dividida) para restaurantes, bares y lomiterías de Paraguay.",
      offers: [{ "@type": "Offer", name: "Plan Gratis «Vidriera»", price: 0, priceCurrency: "PYG" }, { "@type": "Offer", name: "Plan mensual", price: PRICES.planMonthly, priceCurrency: "PYG" }, { "@type": "Offer", name: "Plan anual", price: PRICES.planAnnual, priceCurrency: "PYG" }] }] : []),
    { "@type": pageType, "@id": `${url}#webpage`, url, name: title, description, inLanguage: "es-PY", isPartOf: { "@id": `${SITE_URL}/#website` }, about: { "@id": `${SITE_URL}/#organization` }, primaryImageOfPage: abs("/assets/og-v2.png") },
    ...extra,
    { "@type": "WebSite", "@id": `${SITE_URL}/#website`, name: "Mesaverso", url: abs("/"), inLanguage: "es-PY", publisher: { "@id": `${SITE_URL}/#organization` } },
    ...(pathname === "/" ? [{ "@type": "FAQPage", mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: plain(a) } })) }] : []),
  ];
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${url}">`,
    noindex || !PUBLISH ? `<meta name="robots" content="noindex, nofollow">` : `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">`,
    `<link rel="alternate" hreflang="es-PY" href="${url}"><link rel="alternate" hreflang="x-default" href="${url}">`,
    `<meta property="og:type" content="website"><meta property="og:locale" content="es_PY"><meta property="og:site_name" content="Mesaverso">`,
    `<meta property="og:title" content="${esc(pathname === "/" ? OG_TITLE : title)}"><meta property="og:description" content="${esc(pathname === "/" ? OG_DESC : description)}"><meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${abs("/assets/og-v2.png")}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Mesaverso: menú digital con QR, pedidos y cocina para tu local"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(pathname === "/" ? OG_TITLE : title)}"><meta name="twitter:description" content="${esc(pathname === "/" ? OG_DESC : description)}">`,
    ...(process.env.GOOGLE_SITE_VERIFICATION ? [`<meta name="google-site-verification" content="${esc(process.env.GOOGLE_SITE_VERIFICATION)}">`] : []),
    ...(process.env.BING_SITE_VERIFICATION ? [`<meta name="msvalidate.01" content="${esc(process.env.BING_SITE_VERIFICATION)}">`] : []),
    `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph })}</script>`,
  ].join("\n");
}

function render(template, meta) {
  const out = template.replace(/\{\{([A-Za-z_0-9]+)(?::([A-Za-z0-9_./]+))?\}\}/g, (m, key, arg) => {
    switch (key) {
      case "HEAD_META": return headMeta(meta);
      case "HASH": if (!hashes[arg]) throw new Error(`Unknown hash ${arg}`); return hashes[arg];
      case "WA": return esc(waUrl(arg));
      case "WAFREE": return esc(`https://wa.me/${MESAVERSO_WHATSAPP}?text=${encodeURIComponent("Hola, quiero el plan Gratis de Mesaverso para mi local. Mi local se llama: ")}`);
      case "PRICE": if (!(arg in PRICES)) throw new Error(`Unknown price ${arg}`); return formatGs(PRICES[arg]);
      case "RAW": if (!(arg in PRICES)) throw new Error(`Unknown price ${arg}`); return String(PRICES[arg]);
      case "OWNER": if (!(arg in OWNER)) throw new Error(`Unknown owner field ${arg}`); return esc(OWNER[arg]);
      case "GUIDES_LIST": return guides.map((g) => `<li class="gl"><a href="/${g.slug}/"><b>${esc(g.h1)}</b></a><p>${esc(g.description)}</p></li>`).join("");
      case "MARK": return MARK_SVG;
      case "FOOTER": return footerHtml(meta.pathname === "/");
      case "PAGES_NAV": return [...products, ...rubros].map((p) => `<a href="/${p.slug}/">${esc(p.h1)}</a>`).join("") + (guides.length ? `<a href="/guias/">Guías para dueños de locales</a>` : "");
      case "WA_DISPLAY": return waDisplay;
      case "YEAR": return String(new Date().getFullYear());
      case "QR3D": return qr3d;
      case "FAQ": return faqHtml;
      case "CITY_OPTIONS": return opts(CITIES);
      case "PLACE_OPTIONS": return opts(PLACES);
      case "PRODUCT_OPTIONS": return opts(PRODUCT_RANGES);
      case "INTEREST_OPTIONS": return opts(INTERESTS);
      case "HOW_OPTIONS": return opts(HOWS);
      case "BUSINESS_OPTIONS": return BUSINESS_TYPES.map((t) => `<option${t === "Restaurante" ? " selected" : ""}>${esc(t)}</option>`).join("");
      default: throw new Error(`Unknown placeholder ${m}`);
    }
  });
  if (/\{\{/.test(out)) throw new Error("Unreplaced placeholder");
  return out;
}

const write = async (rel, html) => { const f = path.join(DIST, rel); await mkdir(path.dirname(f), { recursive: true }); await writeFile(f, html); };
const productPages = [];
// ONLY_TRACKED_PAGES=1: publish only pages already committed to git (new drafts being written or reviewed stay out)
const trackedPages = process.env.ONLY_TRACKED_PAGES === "1" ? new Set(spawnSync("git", ["ls-files", "src-v2/pages"], { cwd: ROOT, encoding: "utf8" }).stdout.split(String.fromCharCode(10)).map((x) => path.basename(x.trim()))) : null;
for (const f of (await readdir(path.join(SRC2, "pages"))).filter((x) => x.endsWith(".json") && (!trackedPages || trackedPages.has(x))).sort()) productPages.push(JSON.parse(await readFile(path.join(SRC2, "pages", f), "utf8")));
const kindOf = (p) => p.type || "product";
// topical pairs: each product page links to its guides and each guide back to its product page
const REL = {
  "menu-digital-qr": ["guias/como-armar-menu-digital-qr-paraguay", "guias/carta-digital-o-pdf-con-qr", "guias/como-escribir-la-carta-del-restaurante"],
  "pedidos-por-whatsapp": ["guias/pedidos-por-whatsapp-restaurante"],
  "delivery-propio": ["guias/comision-apps-delivery-canal-propio", "calculadora-comision-delivery"],
  "calculadora-comision-delivery": ["guias/comision-apps-delivery-canal-propio", "delivery-propio"],
  "cuenta-dividida": ["guias/dividir-la-cuenta-restaurante"],
  "plan-gratis": ["guias/como-armar-menu-digital-qr-paraguay"],
  "para-parrillas": ["guias/dividir-la-cuenta-restaurante"],
  "para-cafeterias": ["guias/como-escribir-la-carta-del-restaurante"],
  "para-lomiterias": ["guias/pedidos-por-whatsapp-restaurante"],
  "para-hamburgueserias-y-pizzerias": ["guias/pedidos-por-whatsapp-restaurante", "guias/comision-apps-delivery-canal-propio"],
};
const relatedSlugs = (slug) => [...new Set([...(REL[slug] || []), ...Object.entries(REL).filter(([, v]) => v.includes(slug)).map(([k]) => k)])];
const products = productPages.filter((p) => kindOf(p) === "product");
const rubros = productPages.filter((p) => kindOf(p) === "rubro");
const guides = productPages.filter((p) => kindOf(p) === "guide");
const dmy = (iso) => iso.split("-").reverse().join("/");
// Footer: one component for the home and every inner page. Short labels, grouped columns, bottom legal bar.
const FOOT_LABEL = {
  "menu-digital-qr": "Menú digital con QR", "pedidos-por-whatsapp": "Pedidos por WhatsApp", "delivery-propio": "Delivery propio", "cuenta-dividida": "Cuenta dividida",
  "plan-gratis": "Plan Gratis", "calculadora-comision-delivery": "Calculadora de comisión", "que-es-mesaverso": "Qué es Mesaverso",
  "para-parrillas": "Parrillas", "para-cafeterias": "Cafeterías", "para-lomiterias": "Lomiterías", "para-hamburgueserias-y-pizzerias": "Hamburgueserías y pizzerías",
};
const footerHtml = (home) => {
  const h = home ? "" : "/";
  const link = (slug) => { const p = productPages.find((x) => x.slug === slug); return p ? `<li><a href="/${slug}/">${esc(FOOT_LABEL[slug] || p.h1)}</a></li>` : ""; };
  const col = (title, items) => `<nav class="foot__col" aria-label="${esc(title)}"><p class="foot__h">${esc(title)}</p><ul>${items.join("")}</ul></nav>`;
  return `<footer class="foot"><div class="wrap">
<div class="foot__top">
  <div class="foot__brand">
    <a class="mv-wordmark" href="/" aria-label="Mesaverso, inicio">${MARK_SVG}ESAVERSO</a>
    <p>Menú digital con QR, pedidos y cocina para restaurantes, bares y cafeterías de Paraguay.</p>
    <a class="btn btn--secondary foot__wa" href="${esc(waUrl("general"))}" target="_blank" rel="noopener"><svg class="ico" aria-hidden="true"><use href="#i-wa"/></svg>Hablar por WhatsApp</a>
    <p class="foot__num">${waDisplay}</p>
    <p class="foot__num"><a href="mailto:contacto@mesaverso.app">contacto@mesaverso.app</a></p>
  </div>
  ${col("Producto", [link("menu-digital-qr"), link("pedidos-por-whatsapp"), link("delivery-propio"), link("cuenta-dividida"), link("plan-gratis"), link("calculadora-comision-delivery")])}
  ${col("Para tu local", [link("para-parrillas"), link("para-cafeterias"), link("para-lomiterias"), link("para-hamburgueserias-y-pizzerias")])}
  ${col("Recursos", [link("que-es-mesaverso"), ...(guides.length ? [`<li><a href="/guias/">Guías para dueños</a></li>`] : []), `<li><a href="${h}#planes">Planes y precios</a></li>`, `<li><a href="${h}#preguntas">Preguntas frecuentes</a></li>`])}
  ${col("Legal", [`<li><a href="/terminos/">Términos del sitio</a></li>`, `<li><a href="/terminos-gratis/">Términos del plan Gratis</a></li>`, `<li><a href="/privacidad/">Aviso de privacidad</a></li>`, `<li><a href="/reclamos/">Reclamos y retiro de contenido</a></li>`])}
</div>
<div class="foot__bar">
  <p>© ${new Date().getFullYear()} Mesaverso™ · Hecho en Paraguay · No usamos cookies de seguimiento.</p>
  <p><b>Mesaverso Caja no emite factura.</b> El ticket dice «NO VÁLIDO COMO FACTURA»: seguís facturando con tu sistema habitual.</p>
</div>
</div></footer>`;
};
await write("index.html", render(await readFile(path.join(SRC2, "index.html"), "utf8"), { title: TITLE, description: DESC, pathname: "/" }));

// Legal and small pages share the page shell. They are drafts until a licensed lawyer reviews them.
const draft = PUBLISH ? "" : `<p class="draft"><b>Borrador para revisión.</b> Este texto lo redactó una asistente de IA y todavía no lo revisó un abogado matriculado. No publicar así.</p>`;
const shell = (title, body, { legal = true } = {}) => `<!doctype html><html lang="es-PY" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">{{HEAD_META}}<meta name="theme-color" content="#0e1014"><meta name="color-scheme" content="dark light"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="preload" href="/fonts/familjen-grotesk-latin.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/v2.css?v={{HASH:v2.css}}"></head><body><nav class="nav" aria-label="Principal"><div class="wrap nav__in"><a class="mv-wordmark" href="/" aria-label="Mesaverso, volver al inicio">${MARK_SVG}ESAVERSO</a><div class="nav__end"><a class="btn btn--secondary btn--sm" href="/#cierre"><span class="l">Quiero mi menú</span><span class="s">Empezar</span></a><a class="btn btn--secondary btn--sm" href="/"><span class="l">Inicio</span><span class="s">Inicio</span></a></div></div></nav><main class="wrap legal"><h1>${title}</h1>${legal ? draft : ""}${body}</main>{{FOOTER}}<script src="/m/ev.js?v={{HASH:m/ev.js}}" defer></script><script>if(matchMedia('(prefers-color-scheme: light)').matches)document.documentElement.dataset.theme='light'</script></body></html>`;
const pages = [
  ["privacidad", "Aviso de privacidad", "Aviso de privacidad de Mesaverso: cómo usamos y protegemos los datos que dejás en esta página, y cómo ejercer tus derechos.", "privacidad.body.html"],
  ["terminos", "Términos del sitio", "Términos del sitio de Mesaverso: condiciones de uso de esta página, de sus herramientas de vista previa y del formulario de contacto.", "terminos.body.html"],
  ["terminos-gratis", "Términos del plan Gratis", "Términos del plan Gratis de Mesaverso para locales: qué incluye, uso de los datos del local, baja y cambios.", "terminos-gratis.body.html"],
  ["reclamos", "Reclamos y retiro de contenido", "Cómo pedir que retiremos un contenido o avisarnos de una suplantación.", "reclamos.body.html"],
];
for (const [slug, title, description, file] of pages) {
  const body = (await readFile(path.join(SRC2, file), "utf8")).replace("{{OWNER:VIGENCIA}}", esc(OWNER.VIGENCIA));
  const intro = "";
  await write(`${slug}/index.html`, render(shell(esc(title), intro + body), { title: `${title} | Mesaverso`, description, pathname: `/${slug}/` }));
}
// Real screenshots (fictitious «Local de ejemplo» data) shown inside the product, venue and entity pages: { file, w, h, alt, caption }
const SHOTS = {
  menuCelular: { file: "menu-celular", w: 390, h: 844, mobile: true, alt: "Menú digital de un local de ejemplo en un celular: categorías, platos con precio en guaraníes y buscador", caption: "El menú en el celular del cliente (local de ejemplo, datos ficticios)." },
  menuPedido: { file: "menu-pedido", w: 390, h: 844, mobile: true, alt: "Menú digital en un celular con platos seleccionados y el total del pedido listo para enviar por WhatsApp", caption: "El cliente arma su selección y ve el total antes de pedir (ejemplo con datos ficticios)." },
  cocina: { file: "cocina", w: 1000, h: 695, alt: "Pantalla de cocina de Mesaverso Caja con pedidos de mesa, retiro y delivery y un botón Listo en cada uno", caption: "La pantalla de cocina de Mesaverso Caja, en etapa de prueba (ejemplo con datos ficticios)." },
  cocinaWa: { file: "cocina-whatsapp", w: 1000, h: 695, alt: "Pantalla de cocina con un pedido que llegó por WhatsApp, identificado con un código MV, productos y nota", caption: "Un pedido de WhatsApp ya aceptado, en la cocina (ejemplo con datos ficticios)." },
  mesas: { file: "mesas", w: 1000, h: 695, alt: "Mapa de mesas de Mesaverso Caja con mesas libres y mesas con cuenta abierta y su total", caption: "El mapa de mesas con las cuentas abiertas (ejemplo con datos ficticios)." },
  delivery: { file: "pedido-delivery", w: 1000, h: 695, alt: "Detalle de un pedido de delivery de WhatsApp en Mesaverso Caja con cliente, dirección, productos y total", caption: "El detalle de un pedido por WhatsApp, con productos y total armados (ejemplo con datos ficticios)." },
};
const FIGS = {
  "menu-digital-qr": ["menuCelular", "menuPedido"],
  "plan-gratis": ["menuPedido"],
  "pedidos-por-whatsapp": ["cocinaWa", "delivery"],
  "delivery-propio": ["delivery"],
  "cuenta-dividida": ["mesas"],
  "que-es-mesaverso": ["cocina"],
  "para-parrillas": ["menuCelular"],
  "para-cafeterias": ["menuPedido"],
  "para-lomiterias": ["cocinaWa"],
  "para-hamburgueserias-y-pizzerias": ["cocina"],
};
const shotHtml = (k) => { const x = SHOTS[k]; return `<figure class="shot${x.mobile ? " shot--m" : ""}"><img src="/assets/img/${x.file}.webp" width="${x.w}" height="${x.h}" loading="lazy" decoding="async" alt="${esc(x.alt)}"><figcaption>${esc(x.caption)}</figcaption></figure>`; };
// Product pages (src-v2/pages/*.json): one search intention each, written by Tesa, claims reviewed by Joja.
for (const pg of productPages) {
  const kind = kindOf(pg);
  const others = productPages.filter((o) => o.slug !== pg.slug);
  const pinned = relatedSlugs(pg.slug).map((sl) => others.find((o) => o.slug === sl)).filter(Boolean);
  const related = [...new Set([...pinned, ...others.filter((o) => kindOf(o) === kind), ...others.filter((o) => kindOf(o) !== kind)])].slice(0, 6);
  const rel = related.map((o) => `<li><a href="/${o.slug}/">${esc(o.h1)}</a></li>`).join("");
  const dated = kind === "guide" && pg.modified ? `<p class="fine">Actualizado el ${dmy(pg.modified)} · Equipo Mesaverso</p>` : "";
  const body = `<p class="lead">${esc(pg.lead)}</p>${dated}` + pg.sections.map((s, i) => `<h2>${esc(s.h2)}</h2>${s.html}` + ((FIGS[pg.slug] || []).filter((_, j) => i === (j === 0 ? 0 : 2)).map(shotHtml).join(""))).join("") +
    `<h2>Preguntas frecuentes</h2><div class="faq faq--page">${pg.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><div>${a}</div></details>`).join("")}</div>` +
    `<p class="page__cta"><a class="btn btn--primary" href="/#cierre">${esc(pg.cta)}</a> <a class="btn btn--secondary" href="/#circuito">Ver el circuito completo</a></p>` +
    `<h2>Seguí leyendo</h2><ul>${rel}</ul>`;
  const crumbs = [{ name: "Mesaverso", path: "/" }, ...(kind === "guide" ? [{ name: "Guías", path: "/guias/" }] : []), { name: pg.h1, path: `/${pg.slug}/` }];
  const extra = [
    { "@type": "FAQPage", mainEntity: pg.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: plain(a) } })) },
    { "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: abs(c.path) })) },
  ];
  for (const k of FIGS[pg.slug] || []) extra.push({ "@type": "ImageObject", contentUrl: abs(`/assets/img/${SHOTS[k].file}.webp`), url: abs(`/assets/img/${SHOTS[k].file}.webp`), width: SHOTS[k].w, height: SHOTS[k].h, caption: SHOTS[k].caption, description: SHOTS[k].alt, inLanguage: "es-PY" });
  if (kind !== "guide") extra.push({ "@type": "Service", name: pg.h1, serviceType: "Menú digital y pedidos para locales gastronómicos", description: pg.description, provider: { "@id": `${SITE_URL}/#organization` }, areaServed: { "@type": "Country", name: "Paraguay" }, audience: { "@type": "BusinessAudience", audienceType: "Restaurantes, bares, lomiterías y cafeterías" }, url: abs(`/${pg.slug}/`) });
  if (kind === "guide") extra.push({ "@type": "Article", headline: pg.h1, description: pg.description, datePublished: pg.published, dateModified: pg.modified || pg.published, inLanguage: "es-PY",
    author: { "@type": "Organization", name: "Equipo Mesaverso" }, publisher: { "@type": "Organization", name: "Mesaverso", url: abs("/") }, mainEntityOfPage: abs(`/${pg.slug}/`), image: abs("/assets/og-v2.png") });
  await write(`${pg.slug}/index.html`, render(shell(esc(pg.h1), body, { legal: false }), { title: pg.title, description: pg.description, pathname: `/${pg.slug}/`, extra, pageType: pg.schema || "WebPage" }));
}
// Hub of the guides: one crawlable list with a short description of each
if (guides.length) {
  const list = guides.map((g) => `<li class="gl"><a href="/${g.slug}/"><b>${esc(g.h1)}</b></a><p>${esc(g.description)}</p></li>`).join("");
  const body = `<p class="lead">Guías prácticas para dueños de restaurantes, bares, lomiterías y cafeterías de Paraguay: menú con QR, pedidos por WhatsApp, delivery propio y cuenta dividida.</p><ul class="gl-list">${list}</ul>` +
    `<p class="page__cta"><a class="btn btn--primary" href="/plan-gratis/">Armá tu menú gratis</a> <a class="btn btn--secondary" href="/#planes">Ver planes</a></p>`;
  const extra = [
    { "@type": "CollectionPage", name: "Guías para dueños de locales gastronómicos", url: abs("/guias/"), inLanguage: "es-PY" },
    { "@type": "ItemList", itemListElement: guides.map((g, i) => ({ "@type": "ListItem", position: i + 1, url: abs(`/${g.slug}/`), name: g.h1 })) },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Mesaverso", item: abs("/") }, { "@type": "ListItem", position: 2, name: "Guías", item: abs("/guias/") }] },
  ];
  await write("guias/index.html", render(shell("Guías para dueños de locales gastronómicos", body, { legal: false }), { title: "Guías para restaurantes en Paraguay | Mesaverso", description: "Guías prácticas para dueños de restaurantes y bares de Paraguay: menú con QR, pedidos por WhatsApp, delivery propio y cuenta dividida.", pathname: "/guias/", extra }));
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
const lastmod = (await stat(path.join(SRC2, "index.html"))).mtime.toISOString().slice(0, 10);
const smap = [["/", lastmod], ...(guides.length ? [["/guias/", guides.map((g) => g.modified || g.published).sort().pop()]] : []), ...productPages.map((p) => [`/${p.slug}/`, p.modified || lastmod]), ...pages.map((p) => [`/${p[0]}/`, lastmod])];
await write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${smap.map(([p, d]) => `  <url><loc>${abs(p)}</loc><lastmod>${d}</lastmod></url>`).join("\n")}\n</urlset>\n`);
// IndexNow (Bing, Yandex and others): the public key file proves the site is ours; ping-indexnow.mjs tells them about new or changed URLs
try { const k = (await readFile(path.join(SRC2, "indexnow.key"), "utf8")).trim(); if (k) await write(`${k}.txt`, k); } catch {}
// Search Console ownership files (googleXXXX.html) live in src-v2/ and are served from the root as they are
for (const f of (await readdir(SRC2)).filter((x) => /^google[0-9a-f]+\.html$/.test(x))) await write(f, await readFile(path.join(SRC2, f), "utf8"));
// llms.txt: a plain summary for AI assistants and answer engines (what Mesaverso is, who it is for, where the facts are)
await write("llms.txt", [
  "# Mesaverso",
  "",
  "> Menú digital con QR, pedidos por WhatsApp, cocina en pantalla y cuenta dividida para restaurantes, bares, lomiterías y cafeterías de Paraguay. 0 % de comisión en los pedidos que llegan por el link o QR del local. Plan Gratis disponible (hasta 11 productos). Mesaverso Caja está en etapa de prueba y no emite factura ni cobra pagos online.",
  "",
  "## Funciones",
  ...products.map((p) => `- [${p.h1}](${abs(`/${p.slug}/`)}): ${p.description}`),
  "",
  ...(rubros.length ? ["## Para cada tipo de local", ...rubros.map((p) => `- [${p.h1}](${abs(`/${p.slug}/`)}): ${p.description}`), ""] : []),
  ...(guides.length ? ["## Guías", ...guides.map((p) => `- [${p.h1}](${abs(`/${p.slug}/`)}): ${p.description}`), ""] : []),
  "## Contacto y condiciones",
  `- [Planes y precios](${abs("/#planes")})`,
  `- [Términos del plan Gratis](${abs("/terminos-gratis/")})`,
  `- [Aviso de privacidad](${abs("/privacidad/")})`,
  "",
].join("\n"));

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
