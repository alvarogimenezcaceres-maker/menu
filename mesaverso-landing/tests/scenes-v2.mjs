// Interaction checks for the lazy scenes of the v2 landing (scene «La noche»). Needs `npm run dev:v2` on 8789.
//   node tests/scenes-v2.mjs [baseUrl]
import { chromium } from "playwright-core";
const BASE = (process.argv[2] || "http://127.0.0.1:8789").replace(/\/$/, "");
const browser = await chromium.launch({ channel: "chrome" });
let bad = 0;
const check = (n, ok, d = "") => { if (!ok) bad++; console.log(`${ok ? "OK  " : "FAIL"} ${n}${d ? " → " + d : ""}`); };
for (const [name, viewport, mobile] of [["desktop", { width: 1280, height: 800 }, false], ["mobile", { width: 390, height: 844 }, true]]) {
  for (const reduced of [false, true]) {
    const tag = `${name}${reduced ? "+reduced" : ""}`;
    const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, reducedMotion: reduced ? "reduce" : "no-preference" });
    const page = await ctx.newPage();
    const errors = []; const reqs = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("request", (r) => reqs.push(new URL(r.url()).pathname));
    await page.goto(BASE + "/", { waitUntil: "load" });
    check(`${tag}: scene module not loaded before scrolling`, !reqs.includes("/m/noche.js"));
    await page.locator("#noche").scrollIntoViewIfNeeded();
    await page.waitForSelector("#nocheStage.is-live #nRange", { timeout: 5000 });
    check(`${tag}: scene loaded on demand`, reqs.includes("/m/noche.js"));
    const t0 = await page.inputValue("#nRange");
    await page.waitForTimeout(1200);
    const t1 = await page.inputValue("#nRange");
    check(`${tag}: ${reduced ? "clock does not move on its own" : "clock walks on its own"}`, reduced ? t0 === t1 : +t1 > +t0, `${t0} → ${t1}`);
    await page.focus("#nRange"); await page.keyboard.press("Home");
    check(`${tag}: keyboard moves the clock`, (await page.inputValue("#nRange")) === "0");
    check(`${tag}: no orders at 00:00`, (await page.innerText("#nCount")).toLowerCase().includes("sin pedidos"));
    await page.click('.chip[data-t="1380"]');
    const cnt = await page.innerText("#nCount");
    check(`${tag}: 23:00 shows orders so far`, /\d+ pedidos hasta ahora/i.test(cnt), cnt);
    const before = await page.innerText("#nSay");
    await page.click("#nNext");
    check(`${tag}: advancing the order changes the sentence`, (await page.innerText("#nSay")) !== before);
    const stable = await page.innerText("#nTime");
    await page.waitForTimeout(800);
    check(`${tag}: after touching, the clock stays put`, (await page.innerText("#nTime")) === stable);
    check(`${tag}: no horizontal overflow`, (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);
    check(`${tag}: no console errors (CSP ok)`, errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
}
await browser.close();
process.exit(bad ? 1 : 0);
