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
