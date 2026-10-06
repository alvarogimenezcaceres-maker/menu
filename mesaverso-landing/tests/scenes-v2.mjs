// Interaction checks for the lazy scenes of the v2 landing (hero, live kitchen, complete circuit). Needs `npm run dev:v2` on 8789.
//   node tests/scenes-v2.mjs [baseUrl]
import { chromium } from "playwright-core";
const BASE = (process.argv[2] || "http://127.0.0.1:8789").replace(/\/$/, "");
const browser = await chromium.launch({ channel: "chrome" });
let bad = 0;
const check = (n, ok, d = "") => { if (!ok) bad++; console.log(`${ok ? "OK  " : "FAIL"} ${n}${d ? " → " + d : ""}`); };
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); const reqs = [];
  page.on("request", (r) => reqs.push(r.method() + " " + new URL(r.url()).pathname));
  await page.goto(BASE + "/", { waitUntil: "load" });
  const n0 = reqs.length;
  await page.fill("#heroName", "Parrilla Don Pedro");
  check("hero: the card shows the typed local", (await page.innerText("#heroLocal")) === "Parrilla Don Pedro");
  await page.click('#heroChips [data-r="lomo"]');
  check("hero: the type of local changes the dishes", (await page.innerText("#heroRows")).includes("Lomito"));
  check("hero: the name travels to the preview and the form", (await page.inputValue("#pvName")) === "Parrilla Don Pedro" && (await page.inputValue("#fBusiness")) === "Parrilla Don Pedro");
  check("hero: typing sends nothing to the network", reqs.slice(n0).filter((r) => !r.startsWith("GET ")).length === 0, reqs.slice(n0).join(", "));
  await page.fill("#heroName", "<img src=x onerror=alert(1)>");
  check("hero: the name is shown as text, not as HTML", (await page.$("#heroLocal img")) === null);
  check("hero: no horizontal overflow", (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);
  await page.locator("#top").screenshot({ path: ".shots-v2/hero-a-m.png" });
  await ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(String(e))); page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.fill("#heroName", "Lomitería Prueba"); await page.click('#heroChips [data-r="lomo"]');
  await page.locator("#demo").scrollIntoViewIfNeeded(); await page.waitForSelector("#lvPhone .add", { timeout: 5000 }); await page.waitForTimeout(1200);
  check("live: the phone shows the local and the type of local chosen in the hero", (await page.innerText("#lvPhone")).toLowerCase().includes("lomitería prueba") && (await page.innerText("#lvPhone")).includes("Lomito"));
  check("live: the kitchen starts empty", (await page.innerText("#lvList")).includes("Todavía no llegó"));
  await page.click("#lvPhone .add >> nth=0"); await page.click("#lvPhone .add >> nth=2"); await page.click("#lvPhone .pcta");
  check("live: the order shows up on the kitchen screen", (await page.innerText("#lvList")).includes("Lomito árabe") && (await page.innerText("#lvList")).includes("Papas fritas"));
  await page.click("#lvList button");
  check("live: the customer sees it is being prepared", (await page.innerText("#lvPhone")).includes("En cocina"));
  await page.click("#lvList button");
  check("live: ready reaches the customer and the sentence", (await page.innerText("#lvPhone")).includes("Listo") && (await page.innerText("#lvSay")).includes("Listo"));
  await page.click("#lvReset");
  check("live: reset empties the kitchen", (await page.innerText("#lvList")).includes("Todavía no llegó"));
  check("live: no errors", errs.length === 0, errs.join(" | "));
  await page.locator("#demo").screenshot({ path: ".shots-v2/live-d.png" });
  await ctx.close();
}
for (const [name, viewport, mobile] of [["desktop", { width: 1280, height: 900 }, false], ["mobile", { width: 390, height: 844 }, true]]) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(String(e))); page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.locator("#circuito").scrollIntoViewIfNeeded(); await page.waitForSelector(".cir__st", { timeout: 5000 }); await page.waitForTimeout(900);
  const t = `circuit ${name}`;
  check(`${t}: 7 steps`, (await page.locator(".cir__st").count()) === 7);
  const t0 = await page.innerText("#ciTitle");
  await page.waitForTimeout(7200);
  check(`${t}: it advances on its own while visible`, (await page.innerText("#ciTitle")) !== t0);
  await page.click("#ciPlay");
  const t1 = await page.innerText("#ciTitle"); await page.waitForTimeout(7200);
  check(`${t}: pause really pauses`, (await page.innerText("#ciTitle")) === t1 && (await page.innerText("#ciPlay")) === "Reproducir");
  await page.click('.cir__st[data-i="2"]');
  check(`${t}: tapping a step jumps to it`, (await page.innerText("#ciRole")).toLowerCase() === "mozo");
  await page.locator("#cirStage").screenshot({ path: `.shots-v2/cir-${name}-bar3.png` });
  await page.click('.cir__mode[data-m="casa"]');
  check(`${t}: at home mode resets to step 1`, (await page.innerText("#ciTitle")).includes("link"));
  await page.click('.cir__st[data-i="2"]'); await page.waitForTimeout(200);
  check(`${t}: the WhatsApp message carries the #MV code`, (await page.innerText("#ciDev")).includes("#MV-0042"));
  await page.locator("#cirStage").screenshot({ path: `.shots-v2/cir-${name}-casa3.png` });
  const before = await page.innerText("#ciTitle");
  for (let k = 0; k < 7; k++) await page.click("#ciNext");
  check(`${t}: Next wraps around`, (await page.innerText("#ciTitle")) === before);
  check(`${t}: no horizontal overflow`, (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);
  check(`${t}: no errors`, errs.length === 0, errs.join(" | "));
  await ctx.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
