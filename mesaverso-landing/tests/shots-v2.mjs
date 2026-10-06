// Screenshots and checks of the v2 landing, for review (not part of the live landing's QA).
//   node tests/shots-v2.mjs [baseUrl] [outDir]      default base http://127.0.0.1:8790, out ./.shots-v2
// Needs Chrome installed (playwright-core, channel "chrome"). Takes full-page shots at 1280 and 390 px in dark and light,
// and reports console errors, horizontal overflow and the weight of what loads before the first interaction.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = (process.argv[2] || "http://127.0.0.1:8790").replace(/\/$/, "");
const OUT = process.argv[3] || ".shots-v2";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const report = [];
for (const [name, viewport, mobile] of [["desktop", { width: 1280, height: 800 }, false], ["mobile", { width: 390, height: 844 }, true]]) {
  for (const scheme of ["dark", "light"]) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, colorScheme: scheme });
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    let bytes = 0, reqs = 0;
    page.on("response", async (r) => { try { bytes += (await r.body()).length; reqs++; } catch {} });
    await page.goto(BASE + "/", { waitUntil: "load" });
    await page.waitForTimeout(1500);
    const loadBytes = bytes, loadReqs = reqs;
    await page.addStyleTag({ content: "html{scroll-behavior:auto!important} *{animation-play-state:paused!important}" });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    await page.screenshot({ path: `${OUT}/${name}-${scheme}-hero.png` });
    await page.screenshot({ path: `${OUT}/${name}-${scheme}-full.png`, fullPage: true });
    if (scheme === "dark" || process.env.ALL_SECTIONS) {
      for (const id of ["top", "demo", "vista-previa", "como", "plato-3d", "planes", "cierre"]) {
        const el = await page.$("#" + id); if (el) await el.screenshot({ path: `${OUT}/${name}-${scheme}-sec-${id}.png` });
      }
    }
    report.push({ name, scheme, errors, overflowPx: overflow, loadKB: Math.round(loadBytes / 1024), loadReqs });
    await ctx.close();
  }
}
await browser.close();
console.log(JSON.stringify(report, null, 1));
