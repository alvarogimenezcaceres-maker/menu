// Static build of every restaurant menu for GitHub Pages (Step 1 / pilot).
//   node site/build.mjs            → dist/
// Each seed/<slug>/menu.json becomes dist/<slug>/ with its images, 3D models and QR sheet.
// SITE_URL (env) is the public base URL, e.g. https://menu.example.com/ (used in QR codes and SEO).
import { readFile, writeFile, mkdir, cp, rm, readdir, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import sharp from "sharp";
import QRCode from "qrcode";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const SITE_URL = (process.env.SITE_URL || "http://localhost:8080/").replace(/\/?$/, "/");
const SIZES = [360, 720, 1200];
// order logic shared with the page: the same file is inlined into every menu
const ORDER_CORE = await readFile(path.join(ROOT, "site", "order-core.js"), "utf8");
const OrderCore = vm.runInNewContext(ORDER_CORE + "\nOrderCore;");
// comanda, precuenta and ticket as PDF, inlined into the caja page
const TICKET_CORE = await readFile(path.join(ROOT, "site", "ticket-core.js"), "utf8");

const exists = p => access(p).then(() => true, () => false);
const fill = (tpl, vars) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => {
  if (!(k in vars)) throw new Error(`Template variable {{${k}}} has no value`);
  return vars[k];
});
const attr = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const jsonForScript = v => JSON.stringify(v).replace(/</g, "\\u003c");

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

function jsonLd(m, url) {
  const r = m.restaurant;
  return jsonForScript({
    "@context": "https://schema.org", "@type": "Restaurant", name: r.name, url, image: `${url}img/${r.hero || r.logo}.webp`,
    servesCuisine: r.cuisine, currenciesAccepted: r.currency,
    hasMenu: {
      "@type": "Menu", hasMenuSection: publicMenu(m).categories.map(c => ({
        "@type": "MenuSection", name: c.name,
        hasMenuItem: c.dishes.map(d => ({
          "@type": "MenuItem", name: d.name, description: d.description,
          offers: { "@type": "Offer", price: d.price, priceCurrency: r.currency },
        })),
      })),
    },
  });
}

async function buildImages(seedDir, outDir, names) {
  await mkdir(outDir, { recursive: true });
  for (const name of names) {
    let src = null;
    for (const ext of [".png", ".webp", ".jpg", ".jpeg"]) {
      const p = path.join(seedDir, "images", name + ext);
      if (await exists(p)) { src = p; break; }
    }
    if (!src) throw new Error(`Missing image ${name} in ${seedDir}/images`);
    await sharp(src).webp({ quality: 85 }).toFile(path.join(outDir, `${name}.webp`)); // full size (OG image)
    for (const w of SIZES) {
      await sharp(src).resize({ width: w, height: w, fit: "inside", withoutEnlargement: true })
        .webp({ quality: w <= 360 ? 78 : 82 }).toFile(path.join(outDir, `${name}-${w}.webp`));
    }
  }
}

async function buildRestaurant(slug, templates) {
  const seedDir = path.join(ROOT, "seed", slug);
  const m = JSON.parse(await readFile(path.join(seedDir, "menu.json"), "utf8"));
  const r = m.restaurant, t = r.theme || {};
  const url = `${SITE_URL}${slug}/`;
  const out = path.join(DIST, slug);
  const menu = publicMenu(m);

  const used = new Set([r.logo, r.hero].filter(Boolean));
  menu.categories.forEach(c => { if (c.cover) used.add(c.cover); c.dishes.forEach(d => d.photo && used.add(d.photo)); });
  await buildImages(seedDir, path.join(out, "img"), [...used].filter(Boolean));

  const models = menu.categories.flatMap(c => c.dishes).filter(d => d.model).map(d => d.model);
  if (models.length) {
    await mkdir(path.join(out, "models"), { recursive: true });
    for (const f of models) await cp(path.join(seedDir, "models", f), path.join(out, "models", f));
  }

  const theme = { BG: t.background || "#181818", PRIMARY: t.primary || "#ED9D15", PRIMARY_LIGHT: t.primaryLight || "#FFB943", WINE: t.accentWine || "#8F1B51" };
  await writeFile(path.join(out, "index.html"), fill(templates.menu, {
    ...theme, NAME: attr(r.name), NAME_JSON: jsonForScript(r.name), DESCRIPTION: attr(r.description), TAGLINE: attr(r.tagline || ""),
    URL: url, LOGO: r.logo, OG_IMAGE: r.hero || r.logo, JSONLD: jsonLd(m, url), DATA: jsonForScript(menu),
    HERO_IMG: r.hero ? `<img class="dish" src="img/${r.hero}-720.webp" alt="" fetchpriority="high">` : "",
    WHATSAPP: whatsappDigits(r.whatsapp),
    PRIVACY_LINK: r.legal && r.legal.legalName && r.legal.ruc && r.legal.privacyContact ? ' · <a href="privacidad/">Privacidad</a>' : "",
    REVIEW_URL: jsonForScript(reviewUrl(r.googleReviewUrl)), ORDERING: jsonForScript(OrderCore.orderingConfig(r.ordering)), ORDER_CORE,
  }));

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
    const logo = await sharp(path.join(out, "img", `${r.logo}-360.webp`)).resize({ width: Math.round(size * 0.78), height: Math.round(size * 0.78), fit: "inside" }).toBuffer();
    await sharp({ create: { width: size, height: size, channels: 4, background: "#0E1014" } }).composite([{ input: logo, gravity: "center" }]).png().toFile(path.join(out, "caja", `icon-${size}.png`));
  }
  await writeFile(path.join(out, "caja", "index.html"), fill(templates.caja, { NAME: attr(r.name), NAME_JSON: jsonForScript(r.name), SLUG: slug, ORDER_CORE, TICKET_CORE }));

  // Privacy notice for diners (plan/pos/legal): published only when the restaurant's legal data is loaded in the panel
  const legal = r.legal && r.legal.legalName && r.legal.ruc && r.legal.privacyContact ? r.legal : null;
  if (legal) {
    const mv = templates.mesaverso, mvParts = [mv.holder, mv.ruc && "RUC " + mv.ruc, mv.email].filter(Boolean);
    await mkdir(path.join(out, "privacidad"), { recursive: true });
    await writeFile(path.join(out, "privacidad", "index.html"), fill(templates.privacidad, {
      NAME: attr(r.name), BG: theme.BG, PRIMARY: theme.PRIMARY, LOGO: r.logo,
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
      <img class="logo" src="img/${r.logo}-360.webp" alt="${attr(r.name)}">
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
  return { slug, name: r.name };
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
  };
  const slugs = [];
  for (const e of await readdir(path.join(ROOT, "seed"), { withFileTypes: true })) {
    if (e.isDirectory() && await exists(path.join(ROOT, "seed", e.name, "menu.json"))) slugs.push(e.name);
  }
  const built = [];
  for (const slug of slugs.sort()) built.push(await buildRestaurant(slug, templates));

  // root: straight to the menu when there is only one restaurant, otherwise a list
  const index = built.length === 1
    ? `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${built[0].slug}/"><link rel="canonical" href="${SITE_URL}${built[0].slug}/"><title>${attr(built[0].name)}</title><a href="${built[0].slug}/">Ver el menú</a>`
    : `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Menús</title><ul>${built.map(b => `<li><a href="${b.slug}/">${attr(b.name)}</a></li>`).join("")}</ul>`;
  await writeFile(path.join(DIST, "index.html"), index);
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
    "/assets/*",
    "  Cache-Control: public, max-age=86400",
    "",
  ].join("\n"));
  if (process.env.CUSTOM_DOMAIN) await writeFile(path.join(DIST, "CNAME"), process.env.CUSTOM_DOMAIN + "\n");
  console.log(`Listo → dist/ (SITE_URL=${SITE_URL})`);
}

main().catch(e => { console.error(e); process.exit(1); });
