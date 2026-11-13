// Monthly cron: reads the previous PY-month from D1 and writes a JSON export to R2.
// Scheduled at 10:00 UTC on the 1st of each month = 07:00 PY.
// Bindings required: MV_D1, MV_R2.
// File written: analytics/YYYY-MM.json  (overwrites if re-run, safe to retry).

// Returns the YYYY-MM label for the previous PY month given a cron fire time.
export function prevPyMonth(scheduledTime) {
  // PY is UTC-3 all year. Cron fires 10:00 UTC = 07:00 PY on the 1st, so "last month"
  // in PY == last month in UTC (we're still on the 1st in PY, well past local midnight).
  const d = new Date(scheduledTime);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0-based; 0 = January → previous month in PY
  if (month === 0) return `${year - 1}-12`;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export async function exportMonth(event, env) {
  if (!env.MV_D1 || !env.MV_R2) return;

  const month = prevPyMonth(event.scheduledTime);

  // Pull every row for the month from D1.
  const { results } = await env.MV_D1
    .prepare("SELECT day, slug, ev, dish, hour, src, city, count, sum_total FROM daily WHERE day LIKE ? ORDER BY day, slug, ev")
    .bind(`${month}-%`)
    .all();

  const payload = {
    month,
    exported_at: new Date(event.scheduledTime).toISOString(),
    rows: results ?? [],
  };

  const body = JSON.stringify(payload);
  await env.MV_R2.put(`analytics/${month}.json`, body, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}
