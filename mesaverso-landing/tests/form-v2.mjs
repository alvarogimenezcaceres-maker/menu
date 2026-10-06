// End-to-end check of the v2 landing form against a locally running preview Worker (npm run dev:v2, port 8789).
//   node tests/form-v2.mjs [baseUrl]
// Checks: validation messages, the consent checkbox, the preview/calculator widgets, and a real submit that the Worker
// accepts. The Worker stores the lead in LOCAL KV (wrangler dev), never in production KV.
import { chromium } from "playwright-core";

const BASE = (process.argv[2] || "http://127.0.0.1:8789").replace(/\/$/, "");
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));
const requests = [];
page.on("request", (r) => requests.push(`${r.method()} ${new URL(r.url()).pathname}`));
const results = [];
const check = (name, ok, detail = "") => { results.push([name, ok, detail]); console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? " → " + detail : ""}`); };

await page.goto(BASE + "/", { waitUntil: "load" });
await page.waitForTimeout(3000); // the Worker treats a form filled in under 2.5 s as a bot

// preview tool: typing must not send anything to the network
const before = requests.length;
await page.fill("#pvName", "Lomitería Prueba");
await page.fill("#pvD1", "Lomito árabe");
await page.fill("#pvP1", "38000");
await page.click("#pvScreen .add");
const pvText = await page.innerText("#pvScreen");
check("preview shows the typed local and dish", pvText.includes("Lomitería Prueba") && pvText.includes("Lomito árabe") && pvText.includes("38.000"));
check("preview sends nothing to the network", requests.slice(before).filter((r) => !r.startsWith("GET ")).length === 0, requests.slice(before).join(", "));
const share = decodeURIComponent(await page.getAttribute("#pvShare", "href"));
check("share link carries the local's name", share.includes("Lomitería Prueba") && share.startsWith("https://wa.me/?text="));
await page.fill("#cMonto", "8000000");
await page.waitForTimeout(300); check("commission example recalculates", (await page.innerText("#cOut")).includes("800.000"), await page.innerText("#cOut"));

// validation
await page.click("#send");
const errs = await page.$$eval(".err", (els) => els.map((e) => e.textContent.trim()).filter(Boolean));
check("empty form shows the errors", errs.length >= 3, errs.join(" | "));
await page.fill("#fName", "Ana Prueba");
await page.fill("#fBusiness", "Lomitería Prueba");
await page.fill("#fPhone", "0981 123 456");
await page.click("#send");
check("consent is required", (await page.innerText("#eOk")).length > 0);

// real submit to the local Worker
await page.check("#fOk");
const resp = page.waitForResponse((r) => r.url().endsWith("/api/lead"));
await page.click("#send");
const r = await resp;
const body = await r.json();
check("Worker accepts the lead", r.status() === 200 && body.ok === true, `${r.status()} ${JSON.stringify(body)}`);
await page.waitForSelector("#okBox.show", { timeout: 5000 }).catch(() => {});
check("thank-you box appears with the local's name", (await page.innerText("#okTitle")).includes("Lomitería Prueba"));
check("the form is hidden after sending", await page.$eval("#lead", (f) => f.hidden));
check("no console errors", errors.length === 0, errors.join(" | "));
await browser.close();
const bad = results.filter((x) => !x[1]);
console.log(`\n${results.length - bad.length}/${results.length} checks passed`);
process.exit(bad.length ? 1 : 0);
