#!/usr/bin/env node
// Seed D1 with plausible activity for a demo restaurant.
// Usage:
//   node scripts/seed-demo.mjs <slug>              — insert 7 days of fake data
//   node scripts/seed-demo.mjs <slug> --clean      — remove seeded rows for <slug>
//   node scripts/seed-demo.mjs <slug> --preview    — print rows without writing
//
// Requires wrangler auth: npx wrangler d1 execute …  (runs via child_process)
// Database: mesaverso-analytics (defined in wrangler.jsonc)

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const root  = resolve(__dir, "..");

// ── args ────────────────────────────────────────────────────────────────────
const args  = process.argv.slice(2);
const slug  = args.find(a => !a.startsWith("--"));
const clean = args.includes("--clean");
const preview = args.includes("--preview");

if (!slug) {
  console.error("Usage: node scripts/seed-demo.mjs <slug> [--clean|--preview]");
  process.exit(1);
}

// ── load menu ────────────────────────────────────────────────────────────────
const menuPath = resolve(root, "seed", slug, "menu.json");
let menu;
try { menu = JSON.parse(readFileSync(menuPath, "utf8")); }
catch { console.error(`No se encontró seed/${slug}/menu.json`); process.exit(1); }

// Pick the top dishes by price as a proxy for "featured" items (max 8).
const dishes = menu.categories
  .flatMap(c => c.dishes.map(d => ({ slug: d.slug, price: d.price ?? 0, cat: c.slug })))
  .filter(d => !d.slug.includes("vino") && !d.slug.includes("cerveza"))
  .sort((a, b) => b.price - a.price)
  .slice(0, 8);

if (!dishes.length) { console.error("No se encontraron platos en el menú."); process.exit(1); }

// ── generate rows ─────────────────────────────────────────────────────────────
// Simulate 7 days of activity: realistic PY dinner-hour distribution.
// Events: add_item (menu interaction) + order_tap (WhatsApp tap).
const EVENTS = ["add_item", "order_tap"];
const HOURS  = [12, 13, 19, 20, 21, 22]; // lunch + dinner peaks
const SRCS   = ["ig", "wa", "direct"];

function pyDate(daysBack) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

// Rank dishes: top 3 get more weight.
function countFor(rank, ev, hour) {
  const base = ev === "order_tap" ? 3 : 8;
  const rankMult = [1.8, 1.4, 1.1, 0.8, 0.6, 0.5, 0.4, 0.3][rank] ?? 0.3;
  const hourMult = [20, 21].includes(hour) ? 1.4 : 1;
  return Math.max(1, Math.round(base * rankMult * hourMult * (0.7 + Math.random() * 0.6)));
}

const rows = [];
for (let daysBack = 1; daysBack <= 7; daysBack++) {
  const day = pyDate(daysBack);
  for (const [rank, dish] of dishes.entries()) {
    for (const ev of EVENTS) {
      for (const hour of HOURS) {
        const src = SRCS[Math.floor(Math.random() * SRCS.length)];
        const count = countFor(rank, ev, hour);
        const sumTotal = ev === "order_tap" ? count * dish.price : 0;
        rows.push({ day, slug, ev, dish: dish.slug, hour, src, city: "Asuncion", count, sum_total: sumTotal });
      }
    }
  }
}

// ── execute ──────────────────────────────────────────────────────────────────
const DB = "mesaverso-analytics";

function wrangler(sql) {
  execSync(`npx wrangler d1 execute ${DB} --remote --command "${sql.replace(/"/g, '\\"')}"`, {
    cwd: root, stdio: "inherit",
  });
}

if (clean) {
  console.log(`Borrando filas de demo para slug="${slug}"…`);
  if (!preview) wrangler(`DELETE FROM daily WHERE slug = '${slug}'`);
  else console.log(`  DELETE FROM daily WHERE slug = '${slug}'`);
  console.log("Listo.");
  process.exit(0);
}

if (preview) {
  console.log(`\n${rows.length} filas para slug="${slug}" (preview — no se escriben):\n`);
  const top = [...rows].sort((a, b) => b.count - a.count).slice(0, 10);
  top.forEach(r => console.log(`  ${r.day}  ${r.ev.padEnd(10)}  ${r.dish.padEnd(30)}  h${r.hour}  x${r.count}`));
  console.log(`  … y ${rows.length - 10} más.`);
  process.exit(0);
}

// Batch into chunks of 50 VALUES per INSERT to stay within wrangler limits.
console.log(`Sembrando ${rows.length} filas de demo para slug="${slug}"…`);
const CHUNK = 50;
for (let i = 0; i < rows.length; i += CHUNK) {
  const chunk = rows.slice(i, i + CHUNK);
  const vals = chunk.map(r =>
    `('${r.day}','${r.slug}','${r.ev}','${r.dish}',${r.hour},'${r.src}','${r.city}',${r.count},${r.sum_total})`
  ).join(",");
  const sql = `INSERT INTO daily (day,slug,ev,dish,hour,src,city,count,sum_total) VALUES ${vals} ON CONFLICT DO UPDATE SET count=count+excluded.count, sum_total=sum_total+excluded.sum_total`;
  wrangler(sql);
  process.stdout.write(`  ${Math.min(i + CHUNK, rows.length)}/${rows.length}\r`);
}
console.log(`\nListo. El menú de "${slug}" ya tiene historial. Para limpiar: node scripts/seed-demo.mjs ${slug} --clean`);
