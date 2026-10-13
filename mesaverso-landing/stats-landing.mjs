// What the landing counted (anonymous: views, button clicks, form sent), from Analytics Engine. Runs on the owner's notebook only.
//   node stats-landing.mjs [days=30]
// Credentials: ../.local/cloudflare-analytics.env with CF_ACCOUNT_ID=… and CF_ANALYTICS_TOKEN=… (token with "Account Analytics: Read" only),
// the same file the menus' report uses. Dataset: mesaverso_landing_events (see wrangler.prod.jsonc and src/worker.js, handleEvent).
import { readFile } from "node:fs/promises";
import path from "node:path";

const days = Math.min(90, Math.max(1, Number(process.argv[2]) || 30));
const text = await readFile(path.join(import.meta.dirname, "..", ".local", "cloudflare-analytics.env"), "utf8").catch(() => "");
const env = Object.fromEntries(text.split(/\r?\n/).map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((x) => [x[1], x[2]]));
const account = process.env.CF_ACCOUNT_ID || env.CF_ACCOUNT_ID, token = process.env.CF_ANALYTICS_TOKEN || env.CF_ANALYTICS_TOKEN;
if (!account || !token) { console.error("Falta .local/cloudflare-analytics.env con CF_ACCOUNT_ID y CF_ANALYTICS_TOKEN."); process.exit(1); }

const sql = async (q) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/analytics_engine/sql`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: q });
  if (!r.ok) throw new Error(`Analytics Engine ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).data || [];
};
const W = `timestamp > NOW() - INTERVAL '${days}' DAY`;
const T = "mesaverso_landing_events";
const [byEvent, byPage, bySection, byRef] = await Promise.all([
  sql(`SELECT blob1 AS e, SUM(_sample_interval) AS n FROM ${T} WHERE ${W} GROUP BY e ORDER BY n DESC`),
  sql(`SELECT blob2 AS page, blob1 AS e, SUM(_sample_interval) AS n FROM ${T} WHERE ${W} GROUP BY page, e ORDER BY n DESC LIMIT 60`),
  sql(`SELECT blob3 AS section, blob1 AS e, SUM(_sample_interval) AS n FROM ${T} WHERE ${W} AND blob1 IN ('wa_click','cta_click','lead_sent') GROUP BY section, e ORDER BY n DESC LIMIT 30`),
  sql(`SELECT blob4 AS ref, SUM(_sample_interval) AS n FROM ${T} WHERE ${W} AND blob1 = 'view' AND blob4 != '' GROUP BY ref ORDER BY n DESC LIMIT 20`),
]);
const n = (rows, k) => Number((rows.find((r) => r.e === k) || {}).n || 0);
const views = n(byEvent, "view"), wa = n(byEvent, "wa_click"), cta = n(byEvent, "cta_click"), lead = n(byEvent, "lead_sent");
const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + " %" : "—");
console.log(`\nMesaverso landing, últimos ${days} días (conteos anónimos)\n`);
console.log(`Vistas de página:        ${views}`);
console.log(`Clics a WhatsApp:        ${wa}   (${pct(wa, views)} de las vistas)`);
console.log(`Clics en «Quiero mi menú»: ${cta}   (${pct(cta, views)})`);
console.log(`Formularios enviados:    ${lead}   (${pct(lead, views)})`);
console.log(`Uso de la calculadora:   ${n(byEvent, "calc_used")}`);
console.log("\nPáginas con más vistas:");
byPage.filter((r) => r.e === "view").slice(0, 12).forEach((r) => console.log(`  ${String(r.n).padStart(6)}  ${r.page}`));
console.log("\nDónde se hace clic (sección):");
bySection.forEach((r) => console.log(`  ${String(r.n).padStart(6)}  ${r.e.padEnd(9)} ${r.section || "(sin sección)"}`));
console.log("\nDe dónde llegan (sitio de origen):");
byRef.forEach((r) => console.log(`  ${String(r.n).padStart(6)}  ${r.ref}`));
