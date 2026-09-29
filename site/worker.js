// Worker for the public menus (menu3d-demo). Static assets are served by Cloudflare directly; only
// POST /e runs this script (wrangler.jsonc → assets.run_worker_first), so a failure here never
// breaks a menu. /e receives the anonymous menu events and writes them to Analytics Engine.
// Privacy: no cookies, no IP, no user agent and no order text are stored; `visit` is a random id
// that lives only in the page's memory. Spec: plan/competencia/kuaa-analitica.md (gitignored).

import { handleEvents } from "./events.js";

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === "/e") return handleEvents(request, env);
    return env.ASSETS.fetch(request);
  },
};
