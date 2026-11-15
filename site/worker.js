// Worker for the public menus (menu3d-demo). Static assets are served by Cloudflare directly; only
// POST /e and /api/* run this script (wrangler.jsonc → assets.run_worker_first), so a failure here never
// breaks a menu. /e receives the anonymous menu events and writes them to Analytics Engine.
// Privacy: no cookies, no IP, no user agent and no order text are stored; `visit` is a random id
// that lives only in the page's memory. Spec: plan/competencia/kuaa-analitica.md (gitignored).
// /api/<slug>/… is Mesaverso Caja (site/caja.js): one Durable Object per restaurant.

import { handleEvents } from "./events.js";
import { handleCaja } from "./caja.js";
import { handlePopular } from "./popular.js";
import { aggregate } from "./aggregate.js";
import { exportMonth } from "./export.js";

export { Caja } from "./caja.js";

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === "/e") return handleEvents(request, env);
    if (path === "/api/_health/analytics") return handleAnalyticsHealth(env);
    if (path.endsWith("/popular") && path.startsWith("/api/")) return handlePopular(request, env);
    if (path.startsWith("/api/")) return handleCaja(request, env);
    if (path === "/directorio" || path === "/directorio/") {
      const url = new URL(request.url);
      url.pathname = "/directory.html";
      return env.ASSETS.fetch(new Request(url, request));
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(aggregate(event, env));
    // Monthly export runs on the 1st of each month, from the same daily cron (account cron limit).
    if (new Date(event.scheduledTime).getUTCDate() === 1) {
      ctx.waitUntil(exportMonth(event, env));
    }
  },
};

// GET /api/_health/analytics — read by .github/workflows/health-backup.yml to alert when the daily
// Analytics Engine → D1 aggregation stops (DEC-077). Returns only the last aggregated day and a row
// count: no slugs, dishes or anything per restaurant.
export async function handleAnalyticsHealth(env) {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (!env.MV_D1) return new Response(JSON.stringify({ ok: false, error: "no-d1" }), { status: 200, headers });
  const row = await env.MV_D1.prepare("SELECT MAX(day) AS lastDay, COUNT(*) AS rows FROM daily").first();
  return new Response(JSON.stringify({ ok: true, lastDay: row?.lastDay ?? null, rows: row?.rows ?? 0 }), { status: 200, headers });
}
