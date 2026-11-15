// GET /api/<slug>/popular — returns the top dishes for a restaurant in the last 7 PY days.
// Requires: MV_D1 binding (read-only query on `daily` table).
// Response: { dishes: ["slug-a", "slug-b", ...] }  — empty array when no data.
// Cache-Control: public, max-age=3600 (Cloudflare CDN + browser).

const CORS = { "Access-Control-Allow-Origin": "*" };
const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600, s-maxage=3600", ...CORS };

// Returns YYYY-MM-DD for N days ago in UTC (conservative — PY is UTC-3, never ahead).
export function daysAgo(scheduledTime, n) {
  const d = new Date(scheduledTime);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// Owner decision DEC-073 (2026-11-15): only real orders count (`order_tap` = «Enviar pedido»,
// not dishes added to the list), and nothing shows until there is enough volume, so one person's
// taps never become «Lo más pedido ahora» (k-anonymity floor) and a quiet menu doesn't mislead.
export const MIN_RESTAURANT_ORDERS = 10; // order taps in the window for the whole menu
export const MIN_DISH_ORDERS = 3;        // order taps for a dish to be listed

// Pure query logic, exported for tests.
export async function queryPopular(env, slug, since) {
  if (!env.MV_D1) return [];
  const { results } = await env.MV_D1
    .prepare(
      `SELECT dish, SUM(count) AS total
       FROM daily
       WHERE slug = ? AND ev = 'order_tap' AND day >= ? AND dish != ''
       GROUP BY dish
       ORDER BY total DESC`,
    )
    .bind(slug, since)
    .all();
  const rows = results ?? [];
  const all = rows.reduce((n, r) => n + Number(r.total || 0), 0);
  if (all < MIN_RESTAURANT_ORDERS) return [];
  return rows.filter(r => Number(r.total) >= MIN_DISH_ORDERS).slice(0, 5).map(r => r.dish);
}

export async function handlePopular(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  // Expect: ["api", "<slug>", "popular"]
  const slug = parts[1] ?? "";
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
    return new Response(JSON.stringify({ dishes: [] }), { status: 200, headers: JSON_HEADERS });
  }

  const since = daysAgo(Date.now(), 7);
  const dishes = await queryPopular(env, slug, since);
  return new Response(JSON.stringify({ dishes }), { status: 200, headers: JSON_HEADERS });
}
