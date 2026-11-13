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

// Pure query logic, exported for tests.
export async function queryPopular(env, slug, since) {
  if (!env.MV_D1) return [];
  const { results } = await env.MV_D1
    .prepare(
      `SELECT dish, SUM(count) AS total
       FROM daily
       WHERE slug = ? AND ev IN ('add_item', 'order_tap') AND day >= ? AND dish != ''
       GROUP BY dish
       ORDER BY total DESC
       LIMIT 5`,
    )
    .bind(slug, since)
    .all();
  return (results ?? []).map(r => r.dish);
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
