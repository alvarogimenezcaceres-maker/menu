// Esqueleto de medición para la landing (no es parte del repo; copiar a mesaverso-landing/tests/perf.mjs).
//   node tests/perf.mjs [baseUrl] [--runs=5]
// Sin Lighthouse: Chrome local vía playwright-core + CDP. Perfil "slow 4G" de Lighthouse mobile
// (1,6 Mbps bajada, 750 Kbps subida, 150 ms RTT, CPU x4). Mide LCP, CLS, TBT aprox., bytes y requests.
import { chromium } from "playwright-core";
const BASE = (process.argv[2] || "http://127.0.0.1:8788").replace(/\/$/, "");
const RUNS = +(process.argv.find((a) => a.startsWith("--runs="))?.slice(7) || 5);
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const browser = await chromium.launch({ channel: "chrome" });
const rows = [];
for (let i = 0; i < RUNS; i++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6e6 / 8) * 0.9, uploadThroughput: 750e3 / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  let bytes = 0; const reqs = [];
  cdp.on("Network.loadingFinished", (e) => { bytes += e.encodedDataLength; });
  cdp.on("Network.requestWillBeSent", (e) => reqs.push(e.request.url));
  await page.addInitScript(() => {
    window.__m = { lcp: 0, cls: 0, tbt: 0 };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.duration > 50) window.__m.tbt += e.duration - 50; }).observe({ type: "longtask", buffered: true });
  });
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForTimeout(3000); // sin scroll ni clic: es lo que ve quien solo llega
  const m = await page.evaluate(() => window.__m);
  rows.push({ ...m, kb: Math.round(bytes / 1024), mv: reqs.some((u) => /model-viewer|\.glb/.test(u)), n: reqs.length });
  await ctx.close();
}
await browser.close();
const med = (k) => median(rows.map((r) => r[k]));
const out = { lcp_ms: Math.round(med("lcp")), cls: +med("cls").toFixed(3), tbt_ms: Math.round(med("tbt")), kb_inicial: med("kb"), requests: med("n"), cargo3dSinPedirlo: rows.some((r) => r.mv) };
console.table([out]);
const fail = out.lcp_ms > 2500 || out.cls > 0.1 || out.tbt_ms > 300 || out.kb_inicial > 250 || out.cargo3dSinPedirlo;
console.log(fail ? "FAIL presupuesto" : "PASS presupuesto");
process.exit(fail ? 1 : 0);
