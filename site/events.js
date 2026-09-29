// Validation and parsing for the menu events endpoint (used by worker.js, tested in worker.test.mjs).
// Kept apart because a Worker's main module may only export handlers.

export const EVENTS = new Set(["menu_view", "dish_view", "model_open", "ar_open", "search", "add_item", "checkout_view", "order_tap", "waiter_show", "review_click"]);
export const SOURCES = new Set(["qr", "ig", "maps", "wa", "dir", "fb", "web", "direct"]);
const MODES = new Set(["delivery", "pickup", "table", ""]);
export const MAX_BODY = 8 * 1024;
export const MAX_EVENTS = 60;
const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|whatsapp\/|curl|wget|python|node-fetch/i;

const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v, max) => (Number.isFinite(v) && v >= 0 ? Math.min(Math.round(v), max) : 0);
const slugOk = s => /^[a-z0-9][a-z0-9-]{0,63}$/.test(s);

// Returns the list of data points to write, or null when the batch must be dropped.
export function parseBatch(text, { city = "" } = {}) {
  let body;
  try { body = JSON.parse(text); } catch { return null; }
  if (!body || body.v !== 1 || !Array.isArray(body.events)) return null;
  const slug = str(body.slug, 64), visit = str(body.visit, 16);
  if (!slugOk(slug) || !/^[a-z0-9]{6,16}$/.test(visit) || body.webdriver === true) return null;
  if (body.events.length === 0 || body.events.length > MAX_EVENTS) return null;
  const src = SOURCES.has(body.src) ? body.src : "direct";
  const dev = body.dev === "d" ? "d" : "m";
  const hour = num(body.hour, 23), dow = num(body.dow, 6);
  const points = [];
  for (const e of body.events) {
    if (!e || !EVENTS.has(e.ev)) continue;
    const dish = str(e.dish, 64);
    if (dish && !slugOk(dish)) continue;
    const mode = MODES.has(e.mode) ? e.mode : "";
    // search terms are already normalised in the page; keep letters and spaces only
    const q = e.ev === "search" ? str(e.q, 40).toLowerCase().replace(/[^a-zñ ]/g, "").trim() : "";
    points.push({
      indexes: [slug],
      // blob order is the query contract for scripts/stats-month.mjs: keep it stable
      blobs: [e.ev, src, dish, str(e.cat, 64), mode, q, dev, str(city, 48), visit],
      doubles: [num(e.total, 1e9), num(e.n, 999), num(e.price, 1e9), hour, dow, e.has3d ? 1 : 0],
    });
  }
  return points.length ? points : null;
}

export function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (origin) { try { return new URL(origin).host === new URL(request.url).host; } catch { return false; } }
  return request.headers.get("Sec-Fetch-Site") === "same-origin";
}

export async function handleEvents(request, env) {
  const noContent = new Response(null, { status: 204 });
  try {
    if (request.method !== "POST" || !sameOrigin(request) || BOT_UA.test(request.headers.get("User-Agent") || "")) return noContent;
    if (Number(request.headers.get("Content-Length") || 0) > MAX_BODY) return noContent;
    const text = await request.text();
    if (text.length > MAX_BODY) return noContent;
    const points = parseBatch(text, { city: request.cf?.city || "" });
    if (points && env.MV_EVENTS) for (const p of points) env.MV_EVENTS.writeDataPoint(p);
  } catch { /* never fail the page because of analytics */ }
  return noContent;
}

