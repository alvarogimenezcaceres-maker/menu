import { chromium } from "playwright-core";
const BASE = (process.argv[2] || "http://127.0.0.1:8788").replace(/\/$/, "");
const b = await chromium.launch({ channel: "chrome" });
for (const [w,h] of [[360,800],[768,1024],[1024,768],[1440,900]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  await p.locator(".phone--hero").scrollIntoViewIfNeeded();
  await p.screenshot({ path: `tests/out/hero-${w}.png` });
  if (w === 360) { await p.locator(".plan--3d").scrollIntoViewIfNeeded(); await p.screenshot({ path: `tests/out/plan3d-${w}.png` }); await p.locator(".chat").scrollIntoViewIfNeeded(); await p.screenshot({ path: `tests/out/wa-${w}.png` }); }
  await p.close();
}
await b.close();
