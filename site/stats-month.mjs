// Monthly report per menu, from the anonymous events that site/worker.js writes to Analytics Engine.
// Runs on the owner's notebook only (never in Actions: the repo is public and the numbers belong to clients).
//   node site/stats-month.mjs 2026-10              → negocio/reportes/2026-10/<slug>.txt (gitignored)
//   node site/stats-month.mjs 2026-10 --rows f.json  → same, from saved query rows (offline test)
// Credentials: .local/cloudflare-analytics.env with CF_ACCOUNT_ID=… and CF_ANALYTICS_TOKEN=… (token
// with "Account Analytics: Read" only). Blob/double layout: see parseBatch in site/events.js.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATASET = "mesaverso_menu_events";
const COMMISSION = 0.10; // delivery apps' commission used for "ahorro"; public figure for Paraguay (plan consejo #23)
const MIN_DISH_VIEWS = 30; // below this, per-dish conversion is noise
const PY_OFFSET_H = 3; // Paraguay is UTC-3 all year

const [month, ...rest] = process.argv.slice(2);
if (!/^\d{4}-\d{2}$/.test(month || "")) { console.error("Uso: node site/stats-month.mjs AAAA-MM [--rows archivo.json]"); process.exit(1); }
const rowsFile = rest[0] === "--rows" ? rest[1] : null;

const [y, m] = month.split("-").map(Number);
const utc = (yy, mm) => new Date(Date.UTC(yy, mm - 1, 1, PY_OFFSET_H)).toISOString().slice(0, 19).replace("T", " ");
const from = utc(y, m), to = m === 12 ? utc(y + 1, 1) : utc(y, m + 1);
const WHERE = `timestamp >= toDateTime('${from}') AND timestamp < toDateTime('${to}')`;

// Counts use _sample_interval so they stay right if Analytics Engine samples at high volume.
const QUERIES = {
  events: `SELECT index1 AS slug, blob1 AS ev, SUM(_sample_interval) AS n, SUM(_sample_interval * double1) AS total FROM ${DATASET} WHERE ${WHERE} GROUP BY slug, ev`,
  sources: `SELECT index1 AS slug, blob2 AS src, SUM(_sample_interval) AS n FROM ${DATASET} WHERE ${WHERE} AND blob1 = 'menu_view' GROUP BY slug, src`,
  hours: `SELECT index1 AS slug, blob1 AS ev, double5 AS dow, double4 AS hour, SUM(_sample_interval) AS n FROM ${DATASET} WHERE ${WHERE} AND blob1 IN ('menu_view', 'order_tap') GROUP BY slug, ev, dow, hour`,
  dishes: `SELECT index1 AS slug, blob1 AS ev, blob3 AS dish, SUM(_sample_interval) AS n FROM ${DATASET} WHERE ${WHERE} AND blob1 IN ('dish_view', 'add_item', 'model_open') GROUP BY slug, ev, dish`,
  searches: `SELECT index1 AS slug, blob6 AS q, SUM(_sample_interval) AS n FROM ${DATASET} WHERE ${WHERE} AND blob1 = 'search' GROUP BY slug, q ORDER BY n DESC LIMIT 500`,
};

async function loadEnv() {
  const text = await readFile(path.join(ROOT, ".local", "cloudflare-analytics.env"), "utf8").catch(() => "");
  const env = Object.fromEntries(text.split(/\r?\n/).map(l => l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map(x => [x[1], x[2]]));
  const account = process.env.CF_ACCOUNT_ID || env.CF_ACCOUNT_ID, token = process.env.CF_ANALYTICS_TOKEN || env.CF_ANALYTICS_TOKEN;
  if (!account || !token) { console.error("Falta .local/cloudflare-analytics.env con CF_ACCOUNT_ID y CF_ANALYTICS_TOKEN."); process.exit(1); }
  return { account, token };
}

async function query(sql, { account, token }) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/analytics_engine/sql`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: sql + " FORMAT JSON",
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Analytics Engine respondió ${r.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text).data.map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, k === "n" || k === "total" || k === "hour" || k === "dow" ? Number(v) : v])));
}

async function menus() {
  const out = {};
  for (const slug of await readdir(path.join(ROOT, "seed"))) {
    try {
      const data = JSON.parse(await readFile(path.join(ROOT, "seed", slug, "menu.json"), "utf8"));
      const dishes = {};
      for (const c of data.categories || []) for (const d of c.dishes || []) dishes[d.slug] = { name: d.name, has3d: !!d.model };
      out[slug] = { name: data.restaurant?.name || data.name || slug, dishes };
    } catch { /* not a menu folder */ }
  }
  return out;
}

const gs = n => "₲ " + Math.round(n).toLocaleString("es-PY");
const pct = (a, b) => (b ? Math.round((a / b) * 100) + " %" : "—");
const SRC_LABEL = { qr: "QR", ig: "Instagram", maps: "Google Maps", wa: "WhatsApp", dir: "Directorio Mesaverso", fb: "Facebook", web: "Sitio web", direct: "Directo / sin marcar" };
const DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function report(slug, menu, rows) {
  const mine = k => rows[k].filter(r => r.slug === slug);
  const ev = Object.fromEntries(mine("events").map(r => [r.ev, r]));
  const n = k => ev[k]?.n || 0;
  const visits = n("menu_view"), carts = n("checkout_view"), orders = n("order_tap"), ordersGs = ev.order_tap?.total || 0;
  const lines = [`*${menu.name}: tu menú en ${MONTHS[m - 1]} ${y}*`, ""];
  if (!visits) return lines.concat("Este mes no registramos visitas al menú. Revisemos juntos dónde está compartido el link.").join("\n");

  lines.push(`👀 ${visits.toLocaleString("es-PY")} visitas al menú`);
  lines.push(`🛒 ${carts.toLocaleString("es-PY")} armaron un pedido (${pct(carts, visits)} de las visitas)`);
  lines.push(`📲 ${orders.toLocaleString("es-PY")} pedidos enviados a tu WhatsApp (${pct(orders, visits)} de las visitas), por ${gs(ordersGs)}`);
  if (orders) lines.push(`🧾 Ticket promedio: ${gs(ordersGs / orders)}`);
  if (n("waiter_show")) lines.push(`🍽️ ${n("waiter_show")} pedidos mostrados al mozo en el local`);
  if (ordersGs) lines.push(`💰 Si estos pedidos hubieran entrado por una app con ${COMMISSION * 100} % de comisión, le habrías pagado *${gs(ordersGs * COMMISSION)}*`);

  const src = mine("sources").sort((a, b) => b.n - a.n);
  if (src.length) lines.push("", "*De dónde vinieron*", ...src.map(r => `• ${SRC_LABEL[r.src] || r.src}: ${r.n} (${pct(r.n, visits)})`));

  const peak = (evName) => {
    const byHour = {}, byDow = {};
    for (const r of mine("hours").filter(r => r.ev === evName)) { byHour[r.hour] = (byHour[r.hour] || 0) + r.n; byDow[r.dow] = (byDow[r.dow] || 0) + r.n; }
    const top = o => Object.entries(o).sort((a, b) => b[1] - a[1])[0];
    return { h: top(byHour), d: top(byDow) };
  };
  const pk = peak(orders ? "order_tap" : "menu_view");
  if (pk.h) lines.push("", `*Cuándo ${orders ? "te piden" : "te miran"} más*`, `• Día: ${DAYS[pk.d[0]]}`, `• Hora: de ${pk.h[0]} a ${Number(pk.h[0]) + 1} h`);

  const views = {}, adds = {}, models = {};
  for (const r of mine("dishes")) (r.ev === "dish_view" ? views : r.ev === "add_item" ? adds : models)[r.dish] = r.n;
  const name = d => menu.dishes[d]?.name || d;
  const added = k => `${k} ${k === 1 ? "agregado" : "agregados"}`;
  const topViews = Object.entries(views).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (topViews.length) lines.push("", "*Platos más mirados*", ...topViews.map(([d, v]) => `• ${name(d)}: ${v} vistas, ${added(adds[d] || 0)}`));
  const ignored = Object.entries(views).filter(([d, v]) => v >= MIN_DISH_VIEWS && (adds[d] || 0) / v < 0.05).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (ignored.length) lines.push("", "*Se miran pero casi no se piden* (revisá foto, precio o descripción)", ...ignored.map(([d, v]) => `• ${name(d)}: ${v} vistas, ${added(adds[d] || 0)}`));

  const conv = list => { const v = list.reduce((a, [d]) => a + (views[d] || 0), 0), a = list.reduce((s, [d]) => s + (adds[d] || 0), 0); return { v, a, r: v ? a / v : 0 }; };
  const all = Object.entries(views);
  const with3d = conv(all.filter(([d]) => menu.dishes[d]?.has3d)), without = conv(all.filter(([d]) => !menu.dishes[d]?.has3d));
  if (with3d.v >= MIN_DISH_VIEWS && without.v >= MIN_DISH_VIEWS) {
    lines.push("", "*Platos en 3D*", `• Con 3D: ${pct(with3d.a, with3d.v)} de las vistas se agregan al pedido; sin 3D: ${pct(without.a, without.v)}`);
  }
  const searches = mine("searches").slice(0, 5);
  if (searches.length) lines.push("", "*Lo que más buscaron*", ...searches.map(r => `• «${r.q}»: ${r.n}`));

  lines.push("", "_Pedidos enviados = toques en «Enviar pedido». Los que te llegan llevan el código #MV: contalos en tu WhatsApp para comparar._");
  return lines.join("\n");
}

const rows = rowsFile ? JSON.parse(await readFile(rowsFile, "utf8")) : await (async () => {
  const env = await loadEnv(), out = {};
  for (const [k, sql] of Object.entries(QUERIES)) out[k] = await query(sql, env);
  return out;
})();
const all = await menus();
const dir = path.join(ROOT, "negocio", "reportes", month);
await mkdir(dir, { recursive: true });
const slugs = new Set([...Object.keys(all), ...rows.events.map(r => r.slug)]);
for (const slug of slugs) {
  if (!all[slug]) continue; // events for a menu that is no longer published
  await writeFile(path.join(dir, `${slug}.txt`), report(slug, all[slug], rows) + "\n");
  console.log(`✓ ${slug} → negocio/reportes/${month}/${slug}.txt`);
}
