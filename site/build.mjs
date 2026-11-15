// Static build of every restaurant menu for GitHub Pages (Step 1 / pilot).
//   node site/build.mjs            → dist/
// Each seed/<slug>/menu.json becomes dist/<slug>/ with its images, 3D models and QR sheet.
// SITE_URL (env) is the public base URL, e.g. https://menu.example.com/ (used in QR codes and SEO).
import { readFile, writeFile, mkdir, cp, rm, readdir, access, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import sharp from "sharp";
import QRCode from "qrcode";
import { LEGAL_VERSION } from "./legal-version.js";
import { spawnSync } from "node:child_process";
import * as SEO from "./seo.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = process.env.DIST_DIR ? path.resolve(process.env.DIST_DIR) : path.join(ROOT, "dist"); // DIST_DIR / SEED_DIR: only for build.test.mjs
const SEED = process.env.SEED_DIR ? path.resolve(process.env.SEED_DIR) : path.join(ROOT, "seed");
const SITE_URL = (process.env.SITE_URL || "http://localhost:8080/").replace(/\/?$/, "/");
const SIZES = [360, 720, 1200];
// public address of the sales landing (the badge on free menus links to it); the own domain arrives later
const MESAVERSO_URL = (process.env.MESAVERSO_URL || "https://mesaverso.app").replace(/\/+$/, "");
// order logic shared with the page: the same file is inlined into every menu
const ORDER_CORE = await readFile(path.join(ROOT, "site", "order-core.js"), "utf8");
const OrderCore = vm.runInNewContext(ORDER_CORE + "\nOrderCore;");
// lines tagged "// free-only" exist only in the copy inlined into free menus: paid menus keep byte-identical output
const ORDER_CORE_PAID = ORDER_CORE.replace(/^.*\/\/ free-only\r?\n/gm, "");
// comanda, precuenta and ticket as PDF, inlined into the caja page
const TICKET_CORE = await readFile(path.join(ROOT, "site", "ticket-core.js"), "utf8");

const exists = p => access(p).then(() => true, () => false);
const fill = (tpl, vars) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => {
  if (!(k in vars)) throw new Error(`Template variable {{${k}}} has no value`);
  return vars[k];
});
const attr = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const jsonForScript = v => JSON.stringify(v).replace(/</g, "\\u003c");

// Free plan (restaurant.plan === "free"): "Hecho con Mesaverso" strip + pedido básico. Everything below is injected only for
// free menus; the placeholders are replaced by "" in the others so pilot menus come out byte-identical.
const BADGE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M7 16V8l5 5 5-5v8"/></svg>';
const brandHref = slug => `${MESAVERSO_URL}/?ref=${encodeURIComponent(slug)}&amp;utm_source=menu&amp;utm_medium=badge`;
const brandStrip = slug => `
    <div class="made"><a href="${brandHref(slug)}" target="_blank" rel="noopener">${BADGE_ICON}<span class="t"><b>Hecho con Mesaverso</b><span class="cta">Creá el tuyo gratis<span class="sr"> (se abre en otra pestaña)</span> →</span></span></a></div>`;
// Discreet watermark on every menu that does not already carry the Gratis «Hecho con Mesaverso» strip (owner decision 2026-10-13)
const watermark = slug => `<a class="wm" href="${MESAVERSO_URL}/?ref=${encodeURIComponent(slug)}&amp;utm_source=menu&amp;utm_medium=watermark" target="_blank" rel="noopener" aria-label="Menú digital por Mesaverso"><svg viewBox="0 0 100 100" aria-hidden="true"><path d="M16 80V22L50 60L84 22V80" fill="none" stroke="currentColor" stroke-width="11" stroke-linejoin="round"/><circle cx="16" cy="82" r="10" fill="currentColor"/><circle cx="84" cy="82" r="10" fill="currentColor"/></svg><span>Mesaverso</span></a>`;
const FREE_CSS = `
  .made { margin-top: 10px; padding-top: 14px; border-top: 1px solid var(--line); width: 100%; display: grid; justify-items: center; }
  .made a { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; max-width: 100%; padding: 8px 14px; border: 1px solid var(--line); border-radius: 12px; color: #d6d9dd; text-decoration: none; font-size: 13.5px; line-height: 1.3; }
  .made a:hover .cta, .made a:focus-visible .cta { text-decoration-thickness: 2px; }
  .made svg { width: 22px; height: 22px; flex: none; stroke: #8f949c; }
  .made .t { display: grid; text-align: left; }
  .made .t b { font-weight: 700; color: var(--text); }
  .made .cta { text-decoration: underline; text-underline-offset: 3px; }
  .made .sr, .made-line .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .made-line { margin: 22px 0 4px; display: flex; justify-content: center; }
  .made-line a { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 10px; color: var(--muted); font-size: 13px; text-decoration: none; }
  .made-line .u { text-decoration: underline; text-underline-offset: 3px; }
  .made-line svg { width: 16px; height: 16px; stroke: var(--muted); flex: none; }
`;
// pedido básico: no form, no waiter button, no POST to the caja; WhatsApp only (plain JS strings: no template interpolation here)
const freeParts = slug => ({
  FREE_CSS,
  BRAND_STRIP: brandStrip(slug),
  FREE_A: "false && ",
  FREE_B: ' return WHATSAPP ? `<a class="ar-btn" id="waBtn" href="https://wa.me/${WHATSAPP}" target="_blank" rel="noopener">${WA_ICON}Enviar pedido por WhatsApp</a>` : `<p class="sel-hint">Este local todavía no recibe pedidos por WhatsApp.</p>`;',
  FREE_C: ' + `<p class="sel-hint">El envío, si pedís delivery, lo confirma el local por WhatsApp.</p>`',
  FREE_D: 'true ? "Se abre WhatsApp con tu pedido ya escrito. Ahí le decís al local si es delivery o retiro, tu dirección y cómo vas a pagar." : ',
  FREE_E: `<div class="made-line"><a href="${brandHref(slug)}" target="_blank" rel="noopener">${BADGE_ICON}<span>Hecho con Mesaverso · <span class="u">Creá el tuyo gratis</span><span class="sr"> (se abre en otra pestaña)</span></span></a></div>`,
  FREE_F: ", basic: true",
  FREE_G: '\ndocument.addEventListener("click", e => { if (e.target.closest(".made a, .made-line a")) { track("badge_click"); flushEvents(); } });',
  FREE_H: ' $("#waBtn").href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(orderText())}`;',
});
const FREE_KEYS = Object.keys(freeParts("x"));
// parts that advertise Mesaverso: only the Gratis plan carries them
const BRAND_KEYS = new Set(["FREE_CSS", "BRAND_STRIP", "FREE_E", "FREE_G"]);

// Google review link from the panel: only Google's own review/map URLs reach the page
const reviewUrl = v => {
  const u = String(v || "").trim();
  return /^https:\/\/(search\.google\.com\/local\/writereview\?placeid=[A-Za-z0-9_-]+|g\.page\/r\/[A-Za-z0-9_-]+\/review|www\.google\.com\/maps\/|maps\.app\.goo\.gl\/)/.test(u) ? u : "";
};

// "+595 976 145 539" or "0976 145 539" → "595976145539" (wa.me format); a local 0 prefix assumes Paraguay
const whatsappDigits = v => {
  const d = String(v || "").replace(/\D/g, "");
  return d.startsWith("0") ? "595" + d.slice(1) : d;
};

function publicMenu(m) {
  const categories = m.categories.map(c => ({
    slug: c.slug, name: c.name, description: c.description, cover: c.cover,
    dishes: c.dishes
      .filter(d => d.status !== "draft" && d.price != null)
      .map(({ slug, name, description, price, ingredients, tags, options, photo, model, modelNote, soldOut }) =>
        ({ slug, name, description, price, ingredients, tags, options: options?.length ? OrderCore.normalizeOptions(options) : undefined, photo, model, modelNote, soldOut })),
  })).filter(c => c.dishes.length);
  return { categories };
}

function jsonLd(m, url, img, slug) {
  return SEO.graph(
    SEO.restaurantLd(m, { menuUrl: url, image: `${url}img/${img}.webp` }),
    SEO.breadcrumbLd([["Restaurantes", `${SITE_URL}directorio/`], [m.restaurant.name, `${SITE_URL}directorio/${slug}/`], ["Menú", url]]),
  );
}

// last change of a restaurant's data: git commit date of seed/<slug>, else the menu.json file date
async function lastmod(slug) {
  const g = spawnSync("git", ["log", "-1", "--format=%cs", "--", path.join(SEED, slug)], { cwd: ROOT, encoding: "utf8" });
  const d = (g.stdout || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  try { return (await stat(path.join(SEED, slug, "menu.json"))).mtime.toISOString().slice(0, 10); } catch { return undefined; }
}

// Returns the names that were built. A missing image only warns (the menu still builds), except the ones in `critical`.
async function buildImages(seedDir, outDir, names, critical = []) {
  await mkdir(outDir, { recursive: true });
  const built = new Set();
  for (const name of names) {
    let src = null;
    for (const ext of [".png", ".webp", ".jpg", ".jpeg"]) {
      const p = path.join(seedDir, "images", name + ext);
      if (await exists(p)) { src = p; break; }
    }
    if (!src) {
      if (critical.includes(name)) throw new Error(`Missing image ${name} in ${seedDir}/images`);
      console.warn(`! ${path.basename(seedDir)}: falta la imagen «${name}» en images/ (se omite)`);
      continue;
    }
    built.add(name);
    await sharp(src).webp({ quality: 85 }).toFile(path.join(outDir, `${name}.webp`)); // full size (OG image)
    for (const w of SIZES) {
      await sharp(src).resize({ width: w, height: w, fit: "inside", withoutEnlargement: true })
        .webp({ quality: w <= 360 ? 78 : 82 }).toFile(path.join(outDir, `${name}-${w}.webp`));
    }
  }
  return built;
}

// Stand-in for a missing logo so the pages keep valid image links: the restaurant name as text on a transparent 360 px webp
async function nameLogo(outDir, name, color) {
  const esc = String(name).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="120"><text x="180" y="72" text-anchor="middle" font-family="Georgia, serif" font-size="${esc.length > 18 ? 28 : 40}" fill="${color}">${esc}</text></svg>`;
  let img;
  try { img = await sharp(Buffer.from(svg)).webp({ quality: 85 }).toBuffer(); }
  catch { img = await sharp({ create: { width: 360, height: 120, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).webp().toBuffer(); }
  for (const f of ["nologo", "nologo-360"]) await writeFile(path.join(outDir, `${f}.webp`), img);
}

async function buildRestaurant(slug, templates) {
  const seedDir = path.join(SEED, slug);
  const m = JSON.parse(await readFile(path.join(seedDir, "menu.json"), "utf8"));
  const r = m.restaurant, t = r.theme || {};
  const url = `${SITE_URL}${slug}/`;
  const out = path.join(DIST, slug);
  const menu = publicMenu(m);
  const free = r.plan === "free";
  // a restaurant that only wants its orders on WhatsApp (no form, no waiter QR, no caja link) gets the basic ordering without the Mesaverso strip
  const basic = free || r.orderingMode === "whatsapp";
  // «Reservar mesa»: the visitor fills a small form and WhatsApp opens with the booking written; the venue confirms there (no calendar, no server)
  const reserve = r.reservations === true && !!whatsappDigits(r.whatsapp);

  const used = new Set([r.logo, r.hero].filter(Boolean));
  menu.categories.forEach(c => { if (c.cover) used.add(c.cover); c.dishes.forEach(d => d.photo && used.add(d.photo)); });
  const builtImgs = await buildImages(seedDir, path.join(out, "img"), [...used].filter(Boolean));
  // a missing hero, cover or dish photo is not worth breaking the build; a missing logo gets a text stand-in
  const hasLogo = !!r.logo && builtImgs.has(r.logo);
  if (!hasLogo) {
    console.warn(`! ${slug}: el menú no tiene logo (restaurant.logo ${r.logo ? "«" + r.logo + "» no está en images/" : "vacío"}): se usa el nombre como texto`);
    await nameLogo(path.join(out, "img"), r.name, "#f3ede3");
  }
  const logo = hasLogo ? r.logo : "nologo";
  const hero = r.hero && builtImgs.has(r.hero) ? r.hero : "";
  menu.categories.forEach(c => { if (c.cover && !builtImgs.has(c.cover)) c.cover = null; c.dishes.forEach(d => { if (d.photo && !builtImgs.has(d.photo)) d.photo = null; }); });

  const models = menu.categories.flatMap(c => c.dishes).filter(d => d.model).map(d => d.model);
  if (models.length) {
    await mkdir(path.join(out, "models"), { recursive: true });
    for (const f of models) await cp(path.join(seedDir, "models", f), path.join(out, "models", f));
  }

  const theme = { BG: t.background || "#181818", PRIMARY: t.primary || "#ED9D15", PRIMARY_LIGHT: t.primaryLight || "#FFB943", WINE: t.accentWine || "#8F1B51" };
  await writeFile(path.join(out, "index.html"), fill(templates.menu, {
    ...theme, NAME: attr(r.name), NAME_JSON: jsonForScript(r.name), DESCRIPTION: attr(r.description), TAGLINE: attr(r.tagline || ""),
    URL: url, LOGO: logo, OG_IMAGE: hero || logo, JSONLD: jsonLd(m, url, hero || logo, slug), DATA: jsonForScript(menu),
    HERO_IMG: hero ? `<img class="dish" src="img/${hero}-720.webp" alt="" fetchpriority="high">` : "",
    WHATSAPP: whatsappDigits(r.whatsapp),
    PRIVACY_LINK: r.legal && r.legal.legalName && r.legal.ruc && r.legal.privacyContact ? ' · <a href="privacidad/">Privacidad</a> · <a href="/legal/terminos/">Términos</a>' : ' · <a href="/legal/privacidad/">Privacidad</a> · <a href="/legal/terminos/">Términos</a>',
    REVIEW_URL: jsonForScript(reviewUrl(r.googleReviewUrl)), ORDERING: jsonForScript(OrderCore.orderingConfig(r.ordering)),
    ORDER_CORE: basic ? ORDER_CORE : ORDER_CORE_PAID,
    WATERMARK: free ? "" : watermark(slug),
    HERO_CLASS: r.headerCenter === true ? " hero--center" : "",
    RESERVE_CSS: reserve ? templates.reserve.CSS : "", RESERVE_BTN: reserve ? templates.reserve.BTN : "", RESERVE_DIALOG: reserve ? templates.reserve.DIALOG : "", RESERVE_JS: reserve ? templates.reserve.JS : "",
    // plan Gratis only; "" elsewhere (see freeParts)
    ...Object.fromEntries(FREE_KEYS.map(k => [k, (free || (basic && !BRAND_KEYS.has(k))) ? freeParts(slug)[k] : ""])),
  }));

  // crawlers and no-JS readers get the whole menu as HTML; hidden slugs (demo) are never indexed
  {
    const p = path.join(out, "index.html");
    let html = await readFile(p, "utf8");
    html = html.replace('<div id="menu" tabindex="-1"></div>', () => `<div id="menu" tabindex="-1"></div>\n<noscript><div class="seo-menu">${SEO.menuHtml(m)}</div></noscript>`);
    if (SEO.isHidden(slug)) html = html.replace("<head>", '<head>\n<meta name="robots" content="noindex, nofollow">');
    await writeFile(p, html);
  }
  // the diner downloads their ticket PDF after paying: the PDF writer loads on demand, only for menus with the caja
  if (!basic) await writeFile(path.join(out, "ticket.js"), TICKET_CORE);
  // Mesaverso Caja: the catalog the Worker prices orders with (public data: the same as the menu) and the staff page
  await writeFile(path.join(out, "catalog.json"), JSON.stringify({ name: r.name, ordering: r.ordering || {}, tables: r.tables || 20, categories: menu.categories }));
  await mkdir(path.join(out, "caja"), { recursive: true });
  // the caja installs as an app on the restaurant's tablet (Android: «Agregar a la pantalla principal»)
  await writeFile(path.join(out, "caja", "manifest.webmanifest"), JSON.stringify({
    name: `${r.name} · Caja`, short_name: "Caja", start_url: "./", scope: "./", display: "standalone",
    background_color: "#0E1014", theme_color: "#0E1014", orientation: "any",
    icons: [192, 512].map(s => ({ src: `icon-${s}.png`, sizes: `${s}x${s}`, type: "image/png", purpose: "any" })),
  }));
  for (const size of [192, 512]) {
    const icon = await sharp(path.join(out, "img", `${logo}-360.webp`)).resize({ width: Math.round(size * 0.78), height: Math.round(size * 0.78), fit: "inside" }).toBuffer();
    await sharp({ create: { width: size, height: size, channels: 4, background: "#0E1014" } }).composite([{ input: icon, gravity: "center" }]).png().toFile(path.join(out, "caja", `icon-${size}.png`));
  }
  // a service worker so the caja can show notifications on Android too (no push: they work while the page is open)
  await writeFile(path.join(out, "caja", "sw.js"), [
    'self.addEventListener("install", () => self.skipWaiting());',
    'self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));',
    'self.addEventListener("notificationclick", e => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(l => (l[0] ? l[0].focus() : self.clients.openWindow("./")))); });',
    "",
  ].join("\n"));
  await writeFile(path.join(out, "caja", "index.html"), fill(templates.caja, { NAME: attr(r.name), NAME_JSON: jsonForScript(r.name), SLUG: slug, ORDER_CORE: ORDER_CORE_PAID, TICKET_CORE }));

  // Privacy notice for diners (plan/pos/legal): published only when the restaurant's legal data is loaded in the panel
  const legal = r.legal && r.legal.legalName && r.legal.ruc && r.legal.privacyContact ? r.legal : null;
  if (legal) {
    const mv = templates.mesaverso, mvParts = [mv.holder, mv.ruc && "RUC " + mv.ruc, mv.email].filter(Boolean);
    await mkdir(path.join(out, "privacidad"), { recursive: true });
    await writeFile(path.join(out, "privacidad", "index.html"), fill(templates.privacidad, {
      NAME: attr(r.name), BG: theme.BG, PRIMARY: theme.PRIMARY, LOGO: logo,
      UPDATED: new Date().toLocaleDateString("es-PY", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Asuncion" }),
      LEGAL_NAME: attr(legal.legalName), RUC: attr(legal.ruc), ADDRESS: legal.address ? ", " + attr(legal.address) : "",
      CONTACT: attr(legal.privacyContact), MESAVERSO: mvParts.length ? " (" + mvParts.map(attr).join(", ") + ")" : "",
    }));
  }

  // QR code: one general QR (?s=qr, so the monthly report can tell QR visits apart). Tables have no QR of their own
  // since 2026-09-29: the diner shows the waiter a QR of the order and the waiter picks the table (plan/pos).
  const qrOpts = { margin: 1, errorCorrectionLevel: "M", color: { dark: "#121110", light: "#ffffff" } };
  await writeFile(path.join(out, "qr.svg"), await QRCode.toString(`${url}?s=qr`, { ...qrOpts, type: "svg" }));
  const cards = [];
  const card = (target, label, encoded = target) => QRCode.toString(encoded, { ...qrOpts, type: "svg" }).then(svg => `
    <div class="card">
      <img class="logo" src="img/${logo}-360.webp" alt="${attr(r.name)}">
      <div class="qr"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" alt="QR ${attr(label || r.name)}"></div>
      <strong>Escaneá y pedí desde tu celular</strong>
      <span>Armá tu pedido y mostráselo al mozo. Los de tu mesa se suman desde su celular y al final dividen la cuenta.</span>
      ${label ? `<div class="table">${attr(label)}</div>` : ""}
      <div class="url">${attr(target)}</div>
    </div>`);
  cards.push(await card(url, "", `${url}?s=qr`));
  await mkdir(path.join(out, "qr"), { recursive: true });
  await writeFile(path.join(out, "qr", "index.html"),
    fill(templates.qr, { NAME: attr(r.name), PRIMARY: theme.PRIMARY, CARDS: cards.join("") }).replaceAll('src="img/', 'src="../img/'));

  const count = menu.categories.reduce((n, c) => n + c.dishes.length, 0);
  console.log(`✓ ${slug}: ${menu.categories.length} categorías, ${count} ítems, ${used.size} imágenes, ${models.length} modelos 3D`);
  return { slug, name: r.name, menu: m, lastmod: await lastmod(slug) };
}

async function main() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(path.join(DIST, "assets"), { recursive: true });
  await cp(path.join(ROOT, "site", "node_modules", "@google", "model-viewer", "dist", "model-viewer.min.js"),
    path.join(DIST, "assets", "model-viewer.min.js"));

  const templates = {
    menu: await readFile(path.join(ROOT, "site", "template", "menu.html"), "utf8"),
    qr: await readFile(path.join(ROOT, "site", "template", "qr.html"), "utf8"),
    caja: await readFile(path.join(ROOT, "site", "template", "caja.html"), "utf8"),
    privacidad: await readFile(path.join(ROOT, "site", "template", "privacidad.html"), "utf8"),
    mesaverso: JSON.parse(await readFile(path.join(ROOT, "site", "mesaverso.json"), "utf8")),
    reserve: Object.fromEntries(await Promise.all([["CSS", "reserve.css"], ["BTN", "reserve-btn.html"], ["DIALOG", "reserve-dialog.html"], ["JS", "reserve.js"]].map(async ([k, f]) => [k, await readFile(path.join(ROOT, "site", "template", f), "utf8")]))),
  };
  const slugs = [];
  for (const e of await readdir(SEED, { withFileTypes: true })) {
    if (e.isDirectory() && await exists(path.join(SEED, e.name, "menu.json"))) slugs.push(e.name);
  }
  const built = [];
  for (const slug of slugs.sort()) built.push(await buildRestaurant(slug, templates));

  // Mesaverso legal pages (privacy, terms, staff notice): /legal/<page>/, versioned by site/legal-version.js
  const legalLayout = await readFile(path.join(ROOT, "site", "template", "legal", "layout.html"), "utf8");
  const mv = templates.mesaverso, mvParts = [mv.holder, mv.ruc && "RUC " + mv.ruc, mv.email].filter(Boolean);
  const holder = (mvParts.length ? mvParts.map(attr).join(", ") + ". " : "")
    + `Contacto: por WhatsApp desde <a href="${MESAVERSO_URL}">mesaverso.app</a>.`;
  const legalPages = {
    privacidad: ["Política de privacidad de Mesaverso", "Qué datos usa Mesaverso, para qué, cuánto tiempo y cómo ejercer tus derechos."],
    terminos: ["Términos del servicio para restaurantes", "Condiciones del servicio Mesaverso para restaurantes, incluido el acuerdo de tratamiento de datos."],
    personal: ["Aviso de privacidad para el personal de la Caja", "Qué datos guarda la Caja de Mesaverso sobre el personal del restaurante."],
  };
  for (const [page, [title, description]] of Object.entries(legalPages)) {
    await mkdir(path.join(DIST, "legal", page), { recursive: true });
    await writeFile(path.join(DIST, "legal", page, "index.html"), fill(legalLayout, {
      TITLE: title, DESCRIPTION: description, CANONICAL: `${SITE_URL}legal/${page}/`, VERSION: LEGAL_VERSION,
      MESAVERSO_URL, HOLDER: holder,
      BODY: await readFile(path.join(ROOT, "site", "template", "legal", page + ".html"), "utf8"),
    }));
  }

  // root: redirect to the marketplace directory (shows all restaurants)
  await writeFile(path.join(DIST, "index.html"), `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=directorio/"><link rel="canonical" href="${SITE_URL}directorio/"><title>Mesaverso — Restaurantes</title><a href="directorio/">Ver restaurantes</a>`);
  // marketplace directory page and its data
  await cp(path.join(ROOT, "site", "directory.html"), path.join(DIST, "directory.html"));
  // seed/index.json: served as /seed/index.json so the directory page can fetch it client-side
  await mkdir(path.join(DIST, "seed"), { recursive: true });
  await cp(path.join(ROOT, "seed", "index.json"), path.join(DIST, "seed", "index.json"));
  // logo images for all directory entries (built restaurants + index-only slugs like demo)
  let indexRestaurants = [];
  try { indexRestaurants = JSON.parse(await readFile(path.join(SEED, "index.json"), "utf8")).restaurants || []; } catch { /* no index.json in test envs */ }
  const directorySlugs = new Set([...built.map(r => r.slug), ...indexRestaurants.map(r => r.slug)]);
  for (const slug of directorySlugs) {
    const imgSrc = path.join(SEED, slug, "images");
    const imgDst = path.join(DIST, "seed", slug, "images");
    if (await exists(imgSrc)) {
      await mkdir(imgDst, { recursive: true });
      const files = await readdir(imgSrc);
      for (const f of files) {
        const ext = path.extname(f).toLowerCase();
        if ([".png", ".webp", ".jpg", ".jpeg", ".svg"].includes(ext)) {
          await cp(path.join(imgSrc, f), path.join(imgDst, f));
        }
      }
    }
  }
  // landing pages: /directorio/<slug>/ for each restaurant with a menu.json
  const landingTemplate = await readFile(path.join(ROOT, "site", "landing.html"), "utf8");
  for (const r of built) {
    const menu = JSON.parse(await readFile(path.join(SEED, r.slug, "menu.json"), "utf8"));
    const rest = menu.restaurant || {};
    const accent = rest.theme?.primary || "#ffd6a5";
    const bg = rest.theme?.background || "#0e1014";
    const logoFile = rest.logo;
    // find logo in seed images (supports .png, .webp, .svg)
    const seedImgDir = path.join(SEED, r.slug, "images");
    let logoSrc = "";
    if (logoFile) {
      for (const ext of [".png", ".webp", ".svg"]) {
        if (await exists(path.join(seedImgDir, `${logoFile}${ext}`))) {
          logoSrc = `/seed/${r.slug}/images/${logoFile}${ext}`; break;
        }
      }
    }
    const description = rest.description || rest.tagline || "";
    const canonical = `${SITE_URL}directorio/${r.slug}/`;
    const ogImage = logoSrc ? `${SITE_URL.replace(/\/$/, "")}${logoSrc}` : "";
    const menuUrl = `${SITE_URL}${r.slug}/`;
    const schema = SEO.graph(
      SEO.restaurantLd(menu, { menuUrl, pageUrl: canonical, image: ogImage || undefined }),
      SEO.breadcrumbLd([["Restaurantes", `${SITE_URL}directorio/`], [rest.name, canonical]]),
    );
    const range = SEO.priceRange(menu);
    const preview = `<section class="seo-preview" style="margin-top:28px;text-align:left"><h2 style="font-size:1.1rem">Menú de ${SEO.esc(rest.name)} con precios${range ? " (" + SEO.esc(range) + ")" : ""}</h2>${SEO.menuHtml(menu, { headingLevel: 3 })}</section>`;
    const cuisineArr = Array.isArray(rest.cuisine) ? rest.cuisine : rest.cuisine ? [rest.cuisine] : [];
    const cuisineTags = cuisineArr.map(c => `<span class="tag">${c}</span>`).join("");
    const heroLogo = logoSrc
      ? `<img class="hero-logo" src="${logoSrc}" alt="${rest.name}" loading="eager">`
      : `<span style="font-family:'Familjen Grotesk',sans-serif;font-size:28px;font-weight:700;color:#fff;position:relative;z-index:1">${rest.name}</span>`;
    const infoItems = [];
    if (rest.whatsapp) infoItems.push(`<a class="info-item" href="https://wa.me/${rest.whatsapp.replace(/\s/g,"")}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.63 3.47 2 2 0 0 1 3.59 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.78a16 16 0 0 0 6.29 6.29l1.59-1.59a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>${rest.whatsapp}</a>`);
    if (rest.googleReviewUrl) infoItems.push(`<a class="info-item" href="${rest.googleReviewUrl}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>Calificanos en Google</a>`);
    const infoRows = infoItems.length ? `<div class="info-row">${infoItems.join("")}</div>` : "";
    let page = landingTemplate
      .replace(/{{NAME}}/g, rest.name || r.slug)
      .replace(/{{DESCRIPTION}}/g, description)
      .replace("{{LOCAL_ACCENT}}", accent)
      .replace("{{LOCAL_BG}}", bg)
      .replace(/{{OG_IMAGE}}/g, ogImage)
      .replace(/{{CANONICAL}}/g, canonical)
      .replace("{{SCHEMA}}", () => schema)
      .replace("{{HERO_LOGO}}", heroLogo)
      .replace("{{CUISINE_TAGS}}", cuisineTags)
      .replace("{{SLUG}}", r.slug)
      .replace("{{INFO_ROWS}}", () => infoRows + preview);
    if (SEO.isHidden(r.slug)) page = page.replace("<head>", '<head>\n<meta name="robots" content="noindex, nofollow">');
    const landingDir = path.join(DIST, "directorio", r.slug);
    await mkdir(landingDir, { recursive: true });
    await writeFile(path.join(landingDir, "index.html"), page);
  }

  // search engines: the menus are public pages; the caja, the QR sheet and the API are not
  const base = SITE_URL.replace(/\/$/, "");
  await writeFile(path.join(DIST, "robots.txt"), SEO.robotsTxt(base));
  // Google Search Console ownership file for https://menu.mesaverso.app/ (keep it: removing it unverifies the property)
  await writeFile(path.join(DIST, "google33b12de65a1839f2.html"), "google-site-verification: google33b12de65a1839f2.html");
  await buildDiscovery(built.filter(b => !SEO.isHidden(b.slug)), indexRestaurants, base);
  await writeFile(path.join(DIST, ".nojekyll"), "");
  // Cloudflare response headers (GitHub Pages ignores this file). One `*` per rule: use :slug for the folder. File names aren't hashed,
  // so caches stay short: an edited photo shows up within the hour.
  await writeFile(path.join(DIST, "_headers"), [
    "/*",
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "  Permissions-Policy: camera=(self), xr-spatial-tracking=(self), geolocation=()",
    "/:slug/models/*",
    "  Content-Type: model/gltf-binary",
    "  Cache-Control: public, max-age=3600, stale-while-revalidate=86400",
    "/:slug/img/*",
    "  Cache-Control: public, max-age=3600, stale-while-revalidate=86400",
    "/:slug/catalog.json",
    "  Cache-Control: public, max-age=60",
    "/:slug/caja/*",
    "  X-Robots-Tag: noindex",
    "  Cache-Control: no-cache",
    "/llms*.txt",
    "  Content-Type: text/plain; charset=utf-8",
    // the workers.dev address serves the same pages: keep it out of search results (canonical host is SITE_URL)
    "https://menu3d-demo.alvarogimenezcaceres.workers.dev/*",
    "  X-Robots-Tag: noindex",
    "/assets/*",
    "  Cache-Control: public, max-age=86400",
    "",
  ].join("\n"));
  if (process.env.CUSTOM_DOMAIN) await writeFile(path.join(DIST, "CNAME"), process.env.CUSTOM_DOMAIN + "\n");
  console.log(`Listo → dist/ (SITE_URL=${SITE_URL})`);
}

main().catch(e => { console.error(e); process.exit(1); });

// Directory (static, crawlable), intent pages per cuisine/zone, llms.txt / llms-full.txt and the sitemap.
async function buildDiscovery(list, indexRestaurants, base) {
  const inactive = new Set(indexRestaurants.filter(r => r.active === false).map(r => r.slug));
  list = list.filter(b => !inactive.has(b.slug));
  const dir = `${base}/directorio/`;
  const desc = x => x.menu.restaurant.description || x.menu.restaurant.tagline || "";
  const cuisines = x => [].concat(x.menu.restaurant.cuisine || []).join(", ");
  const where = SEO.whereOf(list);
  const { cuisine, zona } = SEO.intentGroups(list);

  // /directorio/: the same app page plus a static list and an ItemList for crawlers
  let d = await readFile(path.join(ROOT, "site", "directory.html"), "utf8");
  const itemList = { "@type": "ItemList", name: "Restaurantes con menú digital", itemListElement: list.map((x, i) => ({ "@type": "ListItem", position: i + 1, url: `${dir}${x.slug}/`, name: x.name })) };
  const site = { "@type": "WebSite", name: "Mesaverso", url: dir, inLanguage: "es-PY" };
  d = d.replace("</head>", () => `<link rel="canonical" href="${dir}">\n<meta property="og:url" content="${dir}">\n<script type="application/ld+json">${SEO.graph(site, itemList)}</script>\n</head>`);
  const staticList = list.map(x => `<li><a href="/directorio/${x.slug}/">${SEO.esc(x.name)}</a> — ${SEO.esc(desc(x))} <a href="/${x.slug}/">Ver menú con precios</a></li>`).join("");
  const links = [...cuisine.map(c => `<a href="/directorio/cocina/${c.slug}/">${SEO.esc(c.label)}</a>`), ...zona.map(z => `<a href="/directorio/zona/${z.slug}/">${SEO.esc(z.label)}</a>`)].join(" · ");
  d = d.replace('<div id="grid" role="list"></div>', () => `<div id="grid" role="list"></div>\n<noscript><ul>${staticList}</ul><p>${links}</p></noscript>`);
  await mkdir(path.join(DIST, "directorio"), { recursive: true });
  await writeFile(path.join(DIST, "directorio", "index.html"), d);
  await writeFile(path.join(DIST, "directory.html"), d);

  // intent pages: only groups with ≥1 real restaurant
  const pages = [];
  for (const [kind, groups] of [["cocina", cuisine], ["zona", zona]]) {
    for (const g of groups) {
      const url = `${dir}${kind}/${g.slug}/`;
      const w = SEO.whereOf(g.items);
      const h1 = kind === "cocina" ? `${g.label} en ${w}` : `Dónde comer en ${g.label}`;
      const body = g.items.map(x => {
        const dishes = kind === "cocina" ? SEO.matchingDishes(x.menu, g.label) : [];
        const range = SEO.priceRange(x.menu);
        return `<article><h2><a href="/directorio/${x.slug}/">${SEO.esc(x.name)}</a></h2><p>${SEO.esc(desc(x))}${range ? ` Precios: ${SEO.esc(range)}.` : ""}</p>${dishes.length ? `<ul>${dishes.map(dd => `<li>${SEO.esc(dd.name)} — ${SEO.gs(dd.price)}</li>`).join("")}</ul>` : ""}<a class="cta" href="/${x.slug}/">Ver el menú completo de ${SEO.esc(x.name)}</a></article>`;
      }).join("\n");
      const n = g.items.length;
      const ld = SEO.graph(
        { "@type": "CollectionPage", name: h1, url, inLanguage: "es-PY" },
        { "@type": "ItemList", itemListElement: g.items.map((x, i) => ({ "@type": "ListItem", position: i + 1, url: `${dir}${x.slug}/`, name: x.name })) },
        SEO.breadcrumbLd([["Restaurantes", dir], [h1, url]]),
      );
      const html = SEO.intentPage({
        title: `${h1}: menús con precios | Mesaverso`, canonical: url, h1, ld, body,
        description: kind === "cocina"
          ? `${n} ${n === 1 ? "restaurante" : "restaurantes"} con ${g.label.toLowerCase()} en ${w}: menú completo con precios en guaraníes.`
          : `${n} ${n === 1 ? "restaurante" : "restaurantes"} en ${g.label} con menú completo y precios en guaraníes.`,
        intro: `${n === 1 ? "Este restaurante tiene" : "Estos restaurantes tienen"} su menú publicado en Mesaverso, con los precios que carga el propio local.`,
      });
      await mkdir(path.join(DIST, "directorio", kind, g.slug), { recursive: true });
      await writeFile(path.join(DIST, "directorio", kind, g.slug, "index.html"), html);
      pages.push([url, g.items.map(x => x.lastmod).filter(Boolean).sort().pop()]);
    }
  }

  // llms.txt (summary with links) and llms-full.txt (every dish and price), plain language for AI assistants
  const intro = [`# Mesaverso: restaurantes y menús con precios en ${where}`, "",
    `> Directorio de restaurantes de ${where} con su menú digital completo: platos, descripciones y precios en guaraníes (PYG), cargados por cada local. Desde cada menú se puede armar el pedido y mandarlo por WhatsApp o mostrarlo en la mesa.`, "",
    `Directorio: ${dir}`, "Cada restaurante tiene una ficha (/directorio/<slug>/) y su menú con precios (/<slug>/). Solo datos del propio restaurante: sin reseñas ni calificaciones.", ""];
  const restLines = list.map(x => `- [${x.name}](${dir}${x.slug}/): ${desc(x)} Cocina: ${cuisines(x) || "-"}. Precios: ${SEO.priceRange(x.menu) || "-"}. Menú: ${base}/${x.slug}/`);
  const groupLines = [...cuisine.map(c => `- [${c.label}](${dir}cocina/${c.slug}/): ${c.items.map(x => x.name).join(", ")}`),
    ...zona.map(z => `- [${z.label}](${dir}zona/${z.slug}/): ${z.items.map(x => x.name).join(", ")}`)];
  await writeFile(path.join(DIST, "llms.txt"), [...intro, "## Restaurantes", "", ...restLines, "", "## Por tipo de comida y zona", "", ...groupLines, "", "## Optional", "", `- [Menús completos en texto](${base}/llms-full.txt)`, ""].join("\n"));
  await writeFile(path.join(DIST, "llms-full.txt"), [...intro, ...list.flatMap(x => [`## ${x.name}`, "", desc(x), "", `Cocina: ${cuisines(x) || "-"} · Ficha: ${dir}${x.slug}/ · Menú: ${base}/${x.slug}/`, "",
    ...SEO.visibleCategories(x.menu).flatMap(c => [`### ${c.name}`, "", ...c.dishes.map(dd => `- ${dd.name}: ${SEO.gs(dd.price)}${dd.description ? " — " + dd.description : ""}`), ""])])].join("\n"));

  const newest = list.map(x => x.lastmod).filter(Boolean).sort().pop();
  await writeFile(path.join(DIST, "sitemap.xml"), SEO.sitemapXml([
    [dir, newest],
    ...list.flatMap(x => [[`${base}/${x.slug}/`, x.lastmod], [`${dir}${x.slug}/`, x.lastmod]]),
    ...pages,
  ]));
}
