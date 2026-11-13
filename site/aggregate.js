// Daily cron: reads yesterday's Analytics Engine events and upserts into D1 (mesaverso-analytics).
// Scheduled at 09:00 UTC = 06:00 PY; "yesterday PY" = UTC (D-1) 03:00 → UTC D 03:00.
// Worker secrets required: CF_ACCOUNT_ID, CF_ANALYTICS_TOKEN (Account Analytics: Read).
// D1 binding required: MV_D1 (database mesaverso-analytics).
// Blob/double layout: see parseBatch in site/events.js.

const DATASET = "mesaverso_menu_events";
const CHUNK = 100; // D1 batch size per round-trip

// Returns the PY-day window to aggregate and the YYYY-MM-DD label.
export function pyWindow(scheduledTime) {
  const base = new Date(scheduledTime);
  base.setUTCHours(3, 0, 0, 0); // 03:00 UTC = PY midnight
  const toDate = base.toISOString().replace("T", " ").slice(0, 19);
  const fromDate = new Date(base);
  fromDate.setUTCDate(fromDate.getUTCDate() - 1);
  const day = fromDate.toISOString().slice(0, 10); // YYYY-MM-DD PY date for yesterday
  return { from: fromDate.toISOString().replace("T", " ").slice(0, 19), to: toDate, day };
}

async function queryAE(env, sql) {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}` },
      body: sql + " FORMAT JSON",
    },
  );
  if (!r.ok) throw new Error(`AE ${r.status}: ${await r.text().then(t => t.slice(0, 300))}`);
  return (await r.json()).data ?? [];
}

const UPSERT = `
  INSERT INTO daily (day, slug, ev, dish, hour, src, city, count, sum_total)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (day, slug, ev, dish, hour, src, city)
  DO UPDATE SET
    count     = count     + excluded.count,
    sum_total = sum_total + excluded.sum_total
`.trim();

export async function aggregate(event, env) {
  if (!env.CF_ACCOUNT_ID || !env.CF_ANALYTICS_TOKEN || !env.MV_D1) return;
  const { from, to, day } = pyWindow(event.scheduledTime);

  const rows = await queryAE(env, `
    SELECT index1 AS slug, blob1 AS ev, blob3 AS dish,
           CAST(double4 AS INTEGER) AS hour, blob2 AS src, blob8 AS city,
           SUM(_sample_interval) AS count,
           SUM(_sample_interval * double1) AS sum_total
    FROM ${DATASET}
    WHERE timestamp >= toDateTime('${from}') AND timestamp < toDateTime('${to}')
    GROUP BY slug, ev, dish, hour, src, city
  `);

  if (!rows.length) return;

  for (let i = 0; i < rows.length; i += CHUNK) {
    await env.MV_D1.batch(
      rows.slice(i, i + CHUNK).map(r =>
        env.MV_D1.prepare(UPSERT).bind(
          day,
          r.slug || "",
          r.ev || "",
          r.dish || "",
          Number(r.hour) || 0,
          r.src || "",
          r.city || "",
          Number(r.count) || 0,
          Number(r.sum_total) || 0,
        ),
      ),
    );
  }
}
