// Talks to the admin panel for one photogrammetry job (run by .github/workflows/photogrammetry.yml).
//
//   node job.mjs start  <scanId> <workDir>             photos -> <workDir>/images, settings -> <workDir>/job.json
//   node job.mjs finish <scanId> <workDir>             sends out/model-web.glb + out/poster.png to the panel
//   node job.mjs fail   <scanId> <workDir> <message>   tells the panel the job failed
//
// Env: PANEL_URL, WORKER_SECRET; GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID for the run link.
// Every request is signed: X-Worker-Signature = hex HMAC-SHA256(WORKER_SECRET, "<timestamp>.<body>").
// The repo is public, so this never prints photo URLs; it masks them in case a tool echoes one.
import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [cmd, scan, work, message] = process.argv.slice(2);
const { PANEL_URL, WORKER_SECRET, GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
if (!cmd || !scan || !work) throw new Error("usage: node job.mjs start|finish|fail <scanId> <workDir> [message]");
if (!PANEL_URL || !WORKER_SECRET) throw new Error("PANEL_URL and WORKER_SECRET must be set");
const runUrl = GITHUB_RUN_ID ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}` : undefined;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Signed POST to the panel. Retries while Render's free plan wakes the panel up (~1 min). */
async function call(action, payload) {
  const body = JSON.stringify({ scan: Number(scan), runUrl, ...payload });
  for (let attempt = 1; ; attempt++) {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = createHmac("sha256", WORKER_SECRET).update(`${ts}.${body}`).digest("hex");
    try {
      const res = await fetch(`${PANEL_URL.replace(/\/$/, "")}/api/scans/worker/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Worker-Timestamp": ts, "X-Worker-Signature": sig },
        body,
        signal: AbortSignal.timeout(180_000),
      });
      if (res.ok) return await res.json();
      const text = (await res.text()).slice(0, 300);
      if (res.status < 500 || attempt >= 5) throw new Error(`panel ${action}: ${res.status} ${text}`);
      console.log(`panel ${action}: ${res.status}, retrying…`);
    } catch (e) {
      if (attempt >= 5 || String(e.message).startsWith(`panel ${action}:`)) throw e;
      console.log(`panel ${action}: ${e.name}, retrying…`);
    }
    await sleep(20_000 * attempt);
  }
}

if (cmd === "start") {
  const job = await call("start", {});
  for (const p of job.photos) console.log(`::add-mask::${p.url}`);
  const dir = join(work, "images");
  mkdirSync(dir, { recursive: true });
  let i = 0;
  for (const p of job.photos) {
    const res = await fetch(p.url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`photo ${i + 1}: download failed (${res.status})`);
    writeFileSync(join(dir, `${String(++i).padStart(4, "0")}.jpg`), Buffer.from(await res.arrayBuffer()));
  }
  writeFileSync(join(work, "job.json"), JSON.stringify({ diameterCm: job.diameterCm }));
  console.log(`${i} photos · diameter ${job.diameterCm} cm`);
} else if (cmd === "finish") {
  const out = join(work, "out");
  const report = JSON.parse(readFileSync(join(work, "report.json"), "utf8"));
  const validation = JSON.parse(readFileSync(join(out, "validation.json"), "utf8"));
  const res = await call("finish", {
    ok: true,
    model: readFileSync(join(out, "model-web.glb")).toString("base64"),
    poster: readFileSync(join(out, "poster.png")).toString("base64"),
    report: {
      seconds: report.total_seconds,
      glbBytes: report.glb_bytes,
      errors: validation.numErrors,
      warnings: validation.numWarnings,
      triangles: validation.info?.totalTriangleCount,
    },
  });
  console.log(res.message ?? "done");
} else if (cmd === "fail") {
  const res = await call("finish", { ok: false, error: (message || "Falló el procesamiento").slice(0, 300) });
  console.log(res.message ?? "reported");
} else {
  throw new Error(`unknown command ${cmd}`);
}
