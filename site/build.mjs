// Static build of every restaurant menu for GitHub Pages (Step 1 / pilot).
//   node site/build.mjs            → dist/
// Each seed/<slug>/menu.json becomes dist/<slug>/ with its images, 3D models and QR sheet.
// SITE_URL (env) is the public base URL, e.g. https://menu.example.com/ (used in QR codes and SEO).
import { readFile, writeFile, mkdir, cp, rm, readdir, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import QRCode from "qrcode";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const SITE_URL = (process.env.SITE_URL || "http://localhost:8080/").replace(/\/?$/, "/");
const SIZES = [360, 720, 1200];

const exists = p => access(p).then(() => true, () => false);
const fill = (tpl, vars) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => {
  if (!(k in vars)) throw new Error(`Template variable {{${k}}} has no value`);
  return vars[k];
});
const attr = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const jsonForScript = v => JSON.stringify(v).replace(/</g, "\\u003c");

function publicMenu(m) {
  const categories = m.categories.map(c => ({
    slug: c.slug, name: c.name, description: c.description, cover: c.cover,
    dishes: c.dishes
      .filter(d => d.status !== "draft" && d.price != null)
      .map(({ slug, name, description, price, ingredients, tags, options, photo, model, modelNote, soldOut }) =>
        ({ slug, name, description, price, ingredients, tags, options, photo, model, modelNote, soldOut })),
  })).filter(c => c.dishes.length);
  return { categories };
}

function jsonLd(m, url) {
  const r = m.restaurant;
  return jsonForScript({
    "@context": "https://schema.org", "@type": "Restaurant", name: r.name, url, image: `${url}img/${r.hero}.webp`,
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

  const used = new Set([r.logo, r.hero]);
  menu.categories.forEach(c => { if (c.cover) used.add(c.cover); c.dishes.forEach(d => d.photo && used.add(d.photo)); });
  await buildImages(seedDir, path.join(out, "img"), [...used].filter(Boolean));

  const models = menu.categories.flatMap(c => c.dishes).filter(d => d.model).map(d => d.model);
  if (models.length) {
    await mkdir(path.join(out, "models"), { recursive: true });
    for (const f of models) await cp(path.join(seedDir, "models", f), path.join(out, "models", f));
  }

  const theme = { BG: t.background || "#181818", PRIMARY: t.primary || "#ED9D15", PRIMARY_LIGHT: t.primaryLight || "#FFB943", WINE: t.accentWine || "#8F1B51" };
  await writeFile(path.join(out, "index.html"), fill(templates.menu, {
    ...theme, NAME: attr(r.name), DESCRIPTION: attr(r.description), TAGLINE: attr(r.tagline || ""),
    URL: url, LOGO: r.logo, HERO: r.hero, JSONLD: jsonLd(m, url), DATA: jsonForScript(menu),
  }));

  // QR codes: general + one per table (?table=N)
  const qrOpts = { margin: 1, errorCorrectionLevel: "M", color: { dark: "#121110", light: "#ffffff" } };
  await writeFile(path.join(out, "qr.svg"), await QRCode.toString(url, { ...qrOpts, type: "svg" }));
  const cards = [];
  const card = (target, label) => QRCode.toString(target, { ...qrOpts, type: "svg" }).then(svg => `
    <div class="card">
      <img class="logo" src="img/${r.logo}-360.webp" alt="${attr(r.name)}">
      <div class="qr"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" alt="QR ${attr(label || r.name)}"></div>
      <strong>Escaneá y mirá el menú</strong>
      <span>Algunos platos se pueden ver en 3D, sobre tu mesa.</span>
      ${label ? `<div class="table">${attr(label)}</div>` : ""}
      <div class="url">${attr(target)}</div>
    </div>`);
  cards.push(await card(url, ""));
  for (let i = 1; i <= (r.tables || 0); i++) cards.push(await card(`${url}?table=${i}`, `Mesa ${i}`));
  await mkdir(path.join(out, "qr"), { recursive: true });
  await writeFile(path.join(out, "qr", "index.html"),
    fill(templates.qr, { NAME: attr(r.name), PRIMARY: theme.PRIMARY, CARDS: cards.join("") }).replaceAll('src="img/', 'src="../img/'));

  const count = menu.categories.reduce((n, c) => n + c.dishes.length, 0);
  console.log(`✓ ${slug}: ${menu.categories.length} categorías, ${count} ítems, ${used.size} imágenes, ${models.length} modelos 3D, ${r.tables || 0} QR de mesa`);
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
  if (process.env.CUSTOM_DOMAIN) await writeFile(path.join(DIST, "CNAME"), process.env.CUSTOM_DOMAIN + "\n");
  console.log(`Listo → dist/ (SITE_URL=${SITE_URL})`);
}

main().catch(e => { console.error(e); process.exit(1); });
