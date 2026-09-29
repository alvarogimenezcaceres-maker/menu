// Worker for the public menus (menu3d-demo). Static assets are served by Cloudflare directly; only
// POST /e and /api/* run this script (wrangler.jsonc → assets.run_worker_first), so a failure here never
// breaks a menu. /e receives the anonymous menu events and writes them to Analytics Engine.
// Privacy: no cookies, no IP, no user agent and no order text are stored; `visit` is a random id
// that lives only in the page's memory. Spec: plan/competencia/kuaa-analitica.md (gitignored).
// /api/<slug>/… is Mesaverso Caja (site/caja.js): one Durable Object per restaurant.

import { handleEvents } from "./events.js";
import { handleCaja } from "./caja.js";

export { Caja } from "./caja.js";

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === "/e") return handleEvents(request, env);
    if (path.startsWith("/api/")) return handleCaja(request, env);
    return env.ASSETS.fetch(request);
  },
};
