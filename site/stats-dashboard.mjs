// Analytics dashboard — generates negocio/reportes/AAAA-MM/dashboard.html
// Same credentials and queries as stats-month.mjs.
//   node site/stats-dashboard.mjs 2026-10              → negocio/reportes/2026-10/dashboard.html
//   node site/stats-dashboard.mjs 2026-10 filigrana    → only that slug
//   node site/stats-dashboard.mjs 2026-10 --rows f.json  → offline from saved rows
// Open the HTML in any browser — no server needed.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATASET = "mesaverso_menu_events";
const PY_OFFSET_H = 3;
const MIN_DISH_VIEWS = 20;

const args = process.argv.slice(2);
const month = args[0];
if (!/^\d{4}-\d{2}$/.test(month || "")) {
  console.error("Uso: node site/stats-dashboard.mjs AAAA-MM [slug] [--rows archivo.json]");
  process.exit(1);
}
const slugFilter  = args.find(a => !a.startsWith("--") && a !== month) || null;
const rowsFileIdx = args.indexOf("--rows");
const rowsFile    = rowsFileIdx !== -1 ? args[rowsFileIdx + 1] : null;

const [y, m] = month.split("-").map(Number);
const utc = (yy, mm) => new Date(Date.UTC(yy, mm - 1, 1, PY_OFFSET_H)).toISOString().slice(0, 19).replace("T", " ");
const from = utc(y, m), to = m === 12 ? utc(y + 1, 1) : utc(y, m + 1);
const WHERE = `timestamp >= toDateTime('${from}') AND timestamp < toDateTime('${to}')`;

const QUERIES = {
  events:  `SELECT index1 AS slug, blob1 AS ev, SUM(_sample_interval) AS n, SUM(_sample_interval * double1) AS total FROM ${DATASET} WHERE ${WHERE} GROUP BY slug, ev`,
  sources: `SELECT index1 AS slug, blob2 AS src, SUM(_sample_interval) AS n FROM ${DATASET} WHERE ${WHERE} AND blob1 = 'menu_view' GROUP BY slug, src`,
  hours:   `SELECT index1 AS slug, blob1 AS ev, double5 AS dow, double4 AS hour, SUM(_sample_interval) AS n FROM ${DATASET} WHERE ${WHERE} AND blob1 IN ('menu_view', 'order_tap') GROUP BY slug, ev, dow, hour`,
  dishes:  `SELECT index1 AS slug, blob1 AS ev, blob3 AS dish, SUM(_sample_interval) AS n FROM ${DATASET} WHERE ${WHERE} AND blob1 IN ('dish_view', 'add_item', 'model_open') GROUP BY slug, ev, dish`,
  searches:`SELECT index1 AS slug, blob6 AS q, SUM(_sample_interval) AS n FROM ${DATASET} WHERE ${WHERE} AND blob1 = 'search' GROUP BY slug, q ORDER BY n DESC LIMIT 200`,
};

async function loadEnv() {
  const text = await readFile(path.join(ROOT, ".local", "cloudflare-analytics.env"), "utf8").catch(() => "");
  const env  = Object.fromEntries(text.split(/\r?\n/).map(l => l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map(x => [x[1], x[2]]));
  const account = process.env.CF_ACCOUNT_ID || env.CF_ACCOUNT_ID;
  const token   = process.env.CF_ANALYTICS_TOKEN || env.CF_ANALYTICS_TOKEN;
  if (!account || !token) { console.error("Falta .local/cloudflare-analytics.env con CF_ACCOUNT_ID y CF_ANALYTICS_TOKEN."); process.exit(1); }
  return { account, token };
}

async function query(sql, { account, token }) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/analytics_engine/sql`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: sql + " FORMAT JSON",
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Analytics Engine ${r.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text).data.map(row =>
    Object.fromEntries(Object.entries(row).map(([k, v]) =>
      [k, ["n","total","hour","dow"].includes(k) ? Number(v) : v]
    ))
  );
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

const MONTHS_ES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DAYS_ES   = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
const SRC_LABEL = { qr:"QR (mesa/local)", ig:"Instagram", maps:"Google Maps", wa:"WhatsApp", dir:"Directorio Mesaverso", fb:"Facebook", web:"Sitio web", direct:"Directo" };
const gs = n => "₲ " + Math.round(n).toLocaleString("es-PY");
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;

function buildSlugData(slug, menu, rows) {
  const mine = k => rows[k].filter(r => r.slug === slug);
  const ev   = Object.fromEntries(mine("events").map(r => [r.ev, r]));
  const n    = k => ev[k]?.n || 0;

  const visits   = n("menu_view");
  const carts    = n("checkout_view");
  const orders   = n("order_tap");
  const revenue  = ev.order_tap?.total || 0;
  const avgTicket = orders ? revenue / orders : 0;
  const dish3d   = n("model_open");

  // sources
  const sources = mine("sources").sort((a, b) => b.n - a.n);

  // hours grid [dow 0-6][hour 0-23]
  const hourGrid = Array.from({length:7}, () => new Array(24).fill(0));
  for (const r of mine("hours").filter(r => r.ev === "menu_view")) {
    hourGrid[r.dow][r.hour] = (hourGrid[r.dow][r.hour] || 0) + r.n;
  }

  // dishes
  const views = {}, adds = {}, models = {};
  for (const r of mine("dishes")) {
    if (r.ev === "dish_view")  views[r.dish]  = r.n;
    if (r.ev === "add_item")   adds[r.dish]   = r.n;
    if (r.ev === "model_open") models[r.dish] = r.n;
  }
  const topDishes = Object.entries(views).sort((a,b) => b[1]-a[1]).slice(0,10).map(([slug, v]) => ({
    slug, name: menu.dishes[slug]?.name || slug, has3d: menu.dishes[slug]?.has3d || false,
    views: v, adds: adds[slug]||0, conv: pct(adds[slug]||0, v),
  }));

  // searches
  const searches = mine("searches").slice(0, 10);

  return { slug, name: menu.name, visits, carts, orders, revenue, avgTicket, dish3d, sources, hourGrid, topDishes, searches };
}

function escHtml(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

function renderSlug(d) {
  const convCart  = pct(d.carts, d.visits);
  const convOrder = pct(d.orders, d.visits);

  // hour grid max for color scaling
  const allVals = d.hourGrid.flat();
  const hMax    = Math.max(1, ...allVals);

  const heatRows = DAYS_ES.map((day, dow) =>
    `<tr><th>${escHtml(day)}</th>${Array.from({length:24},(_,h)=>{
      const v = d.hourGrid[dow][h];
      const opacity = v ? (0.12 + 0.88 * v / hMax).toFixed(2) : 0;
      return `<td style="background:rgba(237,157,21,${opacity})" title="${day} ${h}:00 — ${v} visitas"></td>`;
    }).join("")}</tr>`
  ).join("");

  const sourceRows = d.sources.map(s =>
    `<tr><td>${escHtml(SRC_LABEL[s.src]||s.src)}</td><td class="num">${s.n.toLocaleString("es-PY")}</td><td class="num">${pct(s.n,d.visits)} %</td></tr>`
  ).join("");

  const dishRows = d.topDishes.map(d =>
    `<tr>
      <td>${escHtml(d.name)}${d.has3d ? ' <span class="badge3d">3D</span>' : ""}</td>
      <td class="num">${d.views.toLocaleString("es-PY")}</td>
      <td class="num">${d.adds.toLocaleString("es-PY")}</td>
      <td class="num ${d.conv>=15?"hi":d.conv<5&&d.views>=MIN_DISH_VIEWS?"lo":""}">${d.conv} %</td>
    </tr>`
  ).join("");

  const searchRows = d.searches.map(s =>
    `<tr><td>«${escHtml(s.q)}»</td><td class="num">${s.n}</td></tr>`
  ).join("");

  // sources chart data for JS
  const srcLabels = JSON.stringify(d.sources.map(s => SRC_LABEL[s.src]||s.src));
  const srcData   = JSON.stringify(d.sources.map(s => s.n));

  // hourly totals for bar chart
  const hourTotals = Array.from({length:24}, (_,h) => d.hourGrid.reduce((a,row)=>a+row[h],0));
  const hourLabels = JSON.stringify(Array.from({length:24},(_,h)=>`${h}:00`));
  const hourData   = JSON.stringify(hourTotals);

  return `
<section class="slug-section" id="slug-${escHtml(d.slug)}">
  <h2>${escHtml(d.name)}</h2>

  <div class="kpis">
    <div class="kpi"><span class="kpi-n">${d.visits.toLocaleString("es-PY")}</span><span class="kpi-l">Visitas al menú</span></div>
    <div class="kpi"><span class="kpi-n">${d.carts.toLocaleString("es-PY")}</span><span class="kpi-l">Armaron pedido <small>${convCart} %</small></span></div>
    <div class="kpi"><span class="kpi-n">${d.orders.toLocaleString("es-PY")}</span><span class="kpi-l">Pedidos enviados <small>${convOrder} %</small></span></div>
    <div class="kpi amber"><span class="kpi-n">${gs(d.revenue)}</span><span class="kpi-l">Total pedidos</span></div>
    ${d.avgTicket ? `<div class="kpi"><span class="kpi-n">${gs(d.avgTicket)}</span><span class="kpi-l">Ticket promedio</span></div>` : ""}
    ${d.dish3d ? `<div class="kpi"><span class="kpi-n">${d.dish3d.toLocaleString("es-PY")}</span><span class="kpi-l">Modelos 3D abiertos</span></div>` : ""}
  </div>

  <div class="charts-row">
    ${d.sources.length ? `
    <div class="chart-box">
      <h3>Origen de las visitas</h3>
      <div class="canvas-wrap"><canvas id="src-${escHtml(d.slug)}" role="img" aria-label="Orígenes de visitas"></canvas></div>
    </div>` : ""}

    <div class="chart-box">
      <h3>Hora del día (visitas)</h3>
      <div class="canvas-wrap"><canvas id="hour-${escHtml(d.slug)}" role="img" aria-label="Visitas por hora"></canvas></div>
    </div>
  </div>

  <div class="tables-row">
    ${d.topDishes.length ? `
    <div class="table-box">
      <h3>Platos más vistos</h3>
      <table>
        <thead><tr><th>Plato</th><th class="num">Vistas</th><th class="num">Agregados</th><th class="num">Conv.</th></tr></thead>
        <tbody>${dishRows}</tbody>
      </table>
    </div>` : ""}

    <div class="side-tables">
      ${d.sources.length ? `
      <div class="table-box">
        <h3>Fuente</h3>
        <table>
          <thead><tr><th>Canal</th><th class="num">Visitas</th><th class="num">%</th></tr></thead>
          <tbody>${sourceRows}</tbody>
        </table>
      </div>` : ""}

      ${d.searches.length ? `
      <div class="table-box">
        <h3>Búsquedas frecuentes</h3>
        <table>
          <thead><tr><th>Término</th><th class="num">Veces</th></tr></thead>
          <tbody>${searchRows}</tbody>
        </table>
      </div>` : ""}
    </div>
  </div>

  <div class="heatmap-box">
    <h3>Visitas por día y hora</h3>
    <div class="heat-wrap">
      <table class="heatmap">
        <thead><tr><th></th>${Array.from({length:24},(_,h)=>`<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${heatRows}</tbody>
      </table>
    </div>
  </div>
</section>
<script>
(function(){
  const palette = ['#ED9D15','#5B9DFF','#4CC38A','#FF9A4D','#B9A3FF','#FF7EB6','#4FD1E0','#FFD84D'];
  ${d.sources.length ? `
  new Chart(document.getElementById('src-${d.slug}'), {
    type:'doughnut',
    data:{ labels:${srcLabels}, datasets:[{data:${srcData}, backgroundColor:palette, borderWidth:0}] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ font:{size:12}, padding:10, boxWidth:12 } } } }
  });` : ""}
  new Chart(document.getElementById('hour-${d.slug}'), {
    type:'bar',
    data:{ labels:${hourLabels}, datasets:[{data:${hourData}, backgroundColor:'rgba(237,157,21,0.75)', borderRadius:3}] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:{ x:{ ticks:{font:{size:10}, maxRotation:0} }, y:{ ticks:{font:{size:11}} } } }
  });
})();
</script>`;
}

function buildHtml(slugsData, monthLabel) {
  const nav = slugsData.length > 1
    ? `<nav class="slug-nav">${slugsData.map(d=>`<a href="#slug-${escHtml(d.slug)}">${escHtml(d.name)}</a>`).join("")}</nav>`
    : "";

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mesaverso Analytics · ${escHtml(monthLabel)}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"><\/script>
<style>
  :root { --bg:#0f0e0c; --surface:#1b1916; --raised:#24211d; --line:#34302a; --text:#f3ede3; --muted:#a89f92; --amber:#ED9D15; --amber-soft:#FFB943; }
  *, *::before, *::after { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.5 system-ui,sans-serif; -webkit-font-smoothing:antialiased; }
  h1 { font-size:22px; font-weight:700; color:var(--amber-soft); margin:0 0 4px; }
  h2 { font-size:19px; font-weight:700; margin:0 0 20px; border-left:4px solid var(--amber); padding-left:12px; }
  h3 { font-size:13px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); margin:0 0 12px; }
  a { color:var(--amber-soft); text-decoration:none; }
  .header { padding:24px 24px 16px; border-bottom:1px solid var(--line); }
  .header p { margin:4px 0 0; color:var(--muted); font-size:13px; }
  .slug-nav { display:flex; flex-wrap:wrap; gap:8px; padding:16px 24px; border-bottom:1px solid var(--line); }
  .slug-nav a { padding:6px 14px; border-radius:999px; border:1px solid var(--line); font-size:13px; font-weight:600; color:var(--muted); }
  .slug-nav a:hover { border-color:var(--amber); color:var(--amber-soft); }
  .slug-section { padding:28px 24px; border-bottom:1px solid var(--line); }
  .kpis { display:flex; flex-wrap:wrap; gap:12px; margin-bottom:28px; }
  .kpi { background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:16px 20px; min-width:140px; flex:1; display:flex; flex-direction:column; gap:4px; }
  .kpi.amber { border-color:rgba(237,157,21,.35); background:rgba(237,157,21,.07); }
  .kpi-n { font-size:22px; font-weight:700; color:var(--text); font-variant-numeric:tabular-nums; }
  .kpi.amber .kpi-n { color:var(--amber-soft); }
  .kpi-l { font-size:12px; color:var(--muted); }
  .kpi-l small { margin-left:4px; color:var(--amber-soft); font-weight:600; }
  .charts-row { display:flex; flex-wrap:wrap; gap:16px; margin-bottom:24px; }
  .chart-box { background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:18px 20px; flex:1; min-width:260px; }
  .canvas-wrap { position:relative; height:220px; }
  .tables-row { display:flex; flex-wrap:wrap; gap:16px; margin-bottom:24px; }
  .table-box { background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:18px 20px; flex:1; min-width:220px; overflow:auto; }
  .side-tables { display:flex; flex-direction:column; gap:16px; min-width:220px; flex:0 1 320px; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  thead th { color:var(--muted); font-weight:600; letter-spacing:.05em; text-transform:uppercase; font-size:11px; padding:0 8px 8px; border-bottom:1px solid var(--line); text-align:left; }
  tbody td { padding:8px 8px; border-bottom:1px solid rgba(52,48,42,.6); vertical-align:middle; }
  .num { text-align:right; font-variant-numeric:tabular-nums; color:var(--muted); }
  td.hi { color:#4CC38A; font-weight:600; }
  td.lo { color:#FF6B6B; }
  .badge3d { font-size:10px; font-weight:700; background:var(--amber); color:#1a1206; border-radius:4px; padding:1px 5px; vertical-align:middle; margin-left:4px; }
  .heatmap-box { background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:18px 20px; }
  .heat-wrap { overflow-x:auto; }
  .heatmap { border-collapse:collapse; min-width:600px; }
  .heatmap th { font-size:10px; color:var(--muted); padding:2px 3px; font-weight:400; text-align:center; min-width:22px; }
  .heatmap tr th:first-child { text-align:right; padding-right:8px; min-width:28px; }
  .heatmap td { width:22px; height:22px; border-radius:4px; cursor:default; }
  .footer { padding:20px 24px; color:var(--muted); font-size:12px; }
</style>
</head>
<body>
<div class="header">
  <h1>Mesaverso Analytics</h1>
  <p>${escHtml(monthLabel)} · generado ${new Date().toLocaleDateString("es-PY", {day:"numeric",month:"long",year:"numeric"})}</p>
</div>
${nav}
${slugsData.map(renderSlug).join("\n")}
<div class="footer">Datos de Analytics Engine (Cloudflare). Eventos anónimos — sin cookies, sin datos personales.</div>
</body>
</html>`;
}

// --- main ---
const rows = rowsFile
  ? JSON.parse(await readFile(rowsFile, "utf8"))
  : await (async () => {
      const env = await loadEnv(), out = {};
      for (const [k, sql] of Object.entries(QUERIES)) { process.stdout.write(`Consultando ${k}... `); out[k] = await query(sql, env); console.log("ok"); }
      return out;
    })();

const allMenus = await menus();
const slugs = [...new Set([...Object.keys(allMenus), ...rows.events.map(r => r.slug)])]
  .filter(s => allMenus[s])
  .filter(s => !slugFilter || s === slugFilter);

const slugsData = slugs.map(slug => buildSlugData(slug, allMenus[slug], rows));

const monthLabel = `${MONTHS_ES[m-1]} ${y}`;
const html = buildHtml(slugsData, monthLabel);

const dir = path.join(ROOT, "negocio", "reportes", month);
await mkdir(dir, { recursive: true });
const outPath = path.join(dir, "dashboard.html");
await writeFile(outPath, html);
console.log(`\n✓ Dashboard → negocio/reportes/${month}/dashboard.html`);
console.log(`  Abrilo en el navegador: start "" "${outPath}"`);
