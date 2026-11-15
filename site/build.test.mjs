// Build tests: free-plan strip, paid menus untouched, and a menu without logo not breaking the others.
//   node --test site/build.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = mkdtempSync(path.join(tmpdir(), "mv-build-"));
const seed = path.join(tmp, "seed"), dist = path.join(tmp, "dist");
let log = "";

const menu = (name, extra = {}, logo = "logo") => ({
  restaurant: { name, description: "d", cuisine: "x", currency: "PYG", whatsapp: "0981 123 456", logo, ...extra },
  categories: [{ slug: "c", name: "C", dishes: [{ slug: "p1", name: "Plato", price: 10000 }] }],
});
async function seedMenu(slug, m, withLogo = true) {
  mkdirSync(path.join(seed, slug, "images"), { recursive: true });
  writeFileSync(path.join(seed, slug, "menu.json"), JSON.stringify(m));
  if (withLogo) await sharp({ create: { width: 40, height: 40, channels: 3, background: "#888" } }).png().toFile(path.join(seed, slug, "images", "logo.png"));
}

before(async () => {
  await seedMenu("zz-gratis", menu("Gratis", { plan: "free" }));
  await seedMenu("zz-piloto", menu("Piloto"));
  await seedMenu("zz-menu", menu("Pago", { plan: "menu" }));
  await seedMenu("zz-sinlogo", menu("Sin Logo", { plan: "free" }, null), false);
  await seedMenu("zz-reserva", menu("Con Reservas", { plan: "menu", reservations: true }));
  await seedMenu("demo", menu("Demo Falso", { cuisine: ["Pizza"] }));
  await seedMenu("zz-pizza", menu("Pizzeria Real", { cuisine: ["Pizza"], city: "Asunción" }));
  await seedMenu("zz-reserva-sinwa", menu("Reserva sin WhatsApp", { plan: "menu", reservations: true, whatsapp: "" }));
  const r = spawnSync(process.execPath, [path.join(ROOT, "site", "build.mjs")], {
    env: { ...process.env, SEED_DIR: seed, DIST_DIR: dist, SITE_URL: "https://t.test/", MESAVERSO_URL: "https://landing.test" }, encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  log = r.stdout + r.stderr;
});
after(() => rmSync(tmp, { recursive: true, force: true }));

const page = slug => readFileSync(path.join(dist, slug, "index.html"), "utf8");

test("free menu carries the Mesaverso strip with its ref and badge_click tracking", () => {
  const h = page("zz-gratis");
  assert.match(h, /class="made"/);
  assert.ok(h.includes("https://landing.test/?ref=zz-gratis&amp;utm_source=menu&amp;utm_medium=badge"));
  assert.ok(h.includes('track("badge_click")'));
  assert.ok(!h.includes("Te paso por acá") || h.includes("basic: true"));
});

test("menus without plan or with plan menu have no trace of the strip or the basic order", () => {
  for (const slug of ["zz-piloto", "zz-menu"]) {
    const h = page(slug);
    assert.ok(!h.includes('class="made"') && !h.includes("badge_click") && !h.includes("basic: true") && !h.includes("Te paso por acá"), slug);
  }
});

test("a menu without logo warns but does not stop the build of the others", () => {
  assert.match(log, /zz-sinlogo: el menú no tiene logo/);
  for (const slug of ["zz-gratis", "zz-piloto", "zz-menu", "zz-sinlogo"]) assert.ok(existsSync(path.join(dist, slug, "index.html")), slug);
  assert.ok(!page("zz-sinlogo").includes("undefined"));
  assert.ok(existsSync(path.join(dist, "zz-sinlogo", "img", "nologo-360.webp")));
});


test("reservations: the «Reservar mesa» button appears only when the restaurant asks for it and has a WhatsApp number", () => {
  const on = page("zz-reserva");
  assert.match(on, /id="reserveBtn"/);
  assert.match(on, /id="reserveDlg"/);
  assert.match(on, /track\("reserve_click"\)/);
  for (const slug of ["zz-piloto", "zz-gratis", "zz-menu", "zz-reserva-sinwa"]) {
    const html = page(slug);
    assert.ok(!html.includes("reserveBtn") && !html.includes("reserveDlg") && !html.includes("reserve-btn"), slug + " must not carry the reservation pieces");
  }
});

test("watermark: every menu without the Gratis strip carries the discreet Mesaverso mark; Gratis menus keep the strip only", () => {
  for (const slug of ["zz-piloto", "zz-menu", "zz-reserva"]) {
    const html = page(slug);
    assert.match(html, /class="wm"/, slug);
    assert.match(html, /utm_medium=watermark/, slug);
  }
  assert.ok(!page("zz-gratis").includes('class="wm"'), "Gratis already has the Hecho con Mesaverso strip");
});

test("legal pages: privacy, terms and staff notice are generated with the current version", async () => {
  const { LEGAL_VERSION } = await import("./legal-version.js");
  for (const p of ["privacidad", "terminos", "personal"]) {
    const f = path.join(dist, "legal", p, "index.html");
    assert.ok(existsSync(f), p);
    const h = readFileSync(f, "utf8");
    assert.ok(h.includes("Versión " + LEGAL_VERSION) && h.includes("Texto en revisión legal"), p);
    assert.ok(!h.includes("{{") && !h.includes("undefined"), p);
  }
});

// --- search and AI discoverability (site/seo.mjs) ---
const read = (...p) => readFileSync(path.join(dist, ...p), "utf8");
const ldBlocks = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));

test("SEO: canonical, og:url and sitemap use the SITE_URL host only", () => {
  for (const f of [["zz-piloto", "index.html"], ["directorio", "zz-piloto", "index.html"], ["directorio", "index.html"], ["directorio", "cocina", "pizza", "index.html"]]) {
    const h = read(...f);
    const c = /<link rel="canonical" href="([^"]+)"/.exec(h);
    assert.ok(c && c[1].startsWith("https://t.test/"), f.join("/"));
    assert.ok(!h.includes("workers.dev"), f.join("/"));
  }
  const sm = read("sitemap.xml");
  for (const loc of sm.matchAll(/<loc>([^<]+)<\/loc>/g)) assert.ok(loc[1].startsWith("https://t.test/"), loc[1]);
  assert.ok(read("_headers").includes(["workers.dev/*", "  X-Robots-Tag: noindex"].join(String.fromCharCode(10))));
});

test("SEO: demo is noindex and excluded from sitemap, llms and intent pages", () => {
  for (const f of ["sitemap.xml", "llms.txt", "llms-full.txt", "directorio/index.html", "directorio/cocina/pizza/index.html"])
    assert.ok(!(read(f).includes("/demo/") || read(f).includes("Demo Falso")), f);
  assert.match(read("demo", "index.html"), /<meta name="robots" content="noindex/);
  assert.match(read("robots.txt"), /Disallow: \/demo\//);
});

test("SEO: JSON-LD parses and describes the restaurant and its menu", () => {
  for (const f of [["zz-piloto", "index.html"], ["directorio", "zz-piloto", "index.html"], ["directorio", "index.html"], ["directorio", "cocina", "pizza", "index.html"]])
    assert.ok(ldBlocks(read(...f)).length, f.join("/"));
  const g = ldBlocks(read("zz-piloto", "index.html"))[0]["@graph"];
  const rest = g.find(n => n["@type"] === "Restaurant");
  assert.equal(rest.hasMenu.hasMenuSection[0].hasMenuItem[0].offers.priceCurrency, "PYG");
  assert.ok(g.some(n => n["@type"] === "BreadcrumbList"));
  assert.ok(ldBlocks(read("directorio", "index.html"))[0]["@graph"].some(n => n["@type"] === "ItemList"));
});

test("SEO: llms.txt, robots, crawlable dishes and real-data intent pages", () => {
  assert.match(read("llms.txt"), /^# Mesaverso/);
  assert.match(read("llms-full.txt"), /Plato: Gs\. 10\.000/);
  const robots = read("robots.txt");
  for (const ua of ["GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot", "Google-Extended"]) assert.ok(robots.includes("User-agent: " + ua), ua);
  assert.match(robots, /Sitemap: https:\/\/t\.test\/sitemap\.xml/);
  assert.match(read("zz-piloto", "index.html"), /<noscript><div class="seo-menu">[\s\S]*Plato/);
  assert.match(read("directorio", "zona", "asuncion", "index.html"), /Pizzeria Real/);
  assert.match(read("directorio", "cocina", "pizza", "index.html"), /<title>Pizza en Asunción: menús con precios/);
  assert.ok(!existsSync(path.join(dist, "directorio", "zona", "paraguay")));
});
