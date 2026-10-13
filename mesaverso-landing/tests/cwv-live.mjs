// Core Web Vitals approximation on the LIVE site: mobile viewport, CPU x4, ~4G network. Noisy on a laptop: run 3 times and read the median.
//   node tests/cwv-live.mjs [url ...]
import { chromium } from "playwright-core";
const urls = process.argv.slice(2).length ? process.argv.slice(2) : ["https://mesaverso.app/", "https://mesaverso.app/guias/como-armar-menu-digital-qr-paraguay/", "https://mesaverso.app/menu-digital-qr/"];
const b = await chromium.launch({ channel: "chrome" });
for (const url of urls) {
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await c.newPage();
    const cdp = await c.newCDPSession(p);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    let bytes = 0; let reqs = 0;
    p.on("response", async (r) => { reqs++; try { const l = r.headers()["content-length"]; if (l) bytes += +l; } catch {} });
    await p.addInitScript(() => {
      window.__v = { lcp: 0, cls: 0, long: 0 };
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__v.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__v.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__v.long += Math.max(0, e.duration - 50); }).observe({ type: "longtask", buffered: true });
    });
    await p.goto(url, { waitUntil: "load" }); await p.waitForTimeout(2500);
    const v = await p.evaluate(() => ({ ...window.__v, nav: performance.getEntriesByType("navigation")[0].responseEnd }));
    runs.push({ lcp: Math.round(v.lcp), cls: +v.cls.toFixed(3), tbt: Math.round(v.long), ttfb: Math.round(v.nav), kb: Math.round(bytes / 1024), reqs });
    await c.close();
  }
  runs.sort((a, b) => a.lcp - b.lcp);
  console.log(url.replace("https://mesaverso.app", "") || "/", "median:", JSON.stringify(runs[1]), "all LCP:", runs.map((r) => r.lcp).join("/"));
}
await b.close();
