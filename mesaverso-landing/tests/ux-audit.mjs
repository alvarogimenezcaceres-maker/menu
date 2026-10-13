// Quick UX audit of a landing page on a phone-sized viewport: overflow, tap targets, small text, first-screen CTA, section map.
//   node tests/ux-audit.mjs [url] [outDir]
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
const URL_ = process.argv[2] || "https://mesaverso.app/";
const OUT = process.argv[3];
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 120)));
await page.goto(URL_, { waitUntil: "load" });
await page.waitForTimeout(1500);
const r = await page.evaluate(() => {
  const vis = (el) => { const b = el.getBoundingClientRect(); const s = getComputedStyle(el); return b.width > 0 && b.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const out = { docW: document.documentElement.scrollWidth, vw: innerWidth, h: document.documentElement.scrollHeight };
  out.small = [...document.querySelectorAll("a,button,summary,input,select,textarea,[role=button],[role=tab]")].filter(vis).map((el) => {
    const b = el.getBoundingClientRect(); return { t: (el.innerText || el.getAttribute("aria-label") || el.name || el.tagName).trim().slice(0, 28), w: Math.round(b.width), h: Math.round(b.height), y: Math.round(b.top + scrollY) };
  }).filter((x) => x.h < 40 || x.w < 40);
  const tiny = new Map();
  for (const el of document.querySelectorAll("body *")) {
    if (!vis(el) || !el.childNodes.length) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2);
    if (!own) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 12) tiny.set(el.className || el.tagName, fs);
  }
  out.tiny = [...tiny].slice(0, 12);
  out.sections = [...document.querySelectorAll("main > section, body > section, section[id]")].map((s) => ({ id: s.id || s.className.slice(0, 20), y: Math.round(s.getBoundingClientRect().top + scrollY), h: Math.round(s.getBoundingClientRect().height) }));
  out.fold = [...document.querySelectorAll("a,button")].filter(vis).filter((e) => e.getBoundingClientRect().top < innerHeight && e.getBoundingClientRect().bottom > 0).map((e) => (e.innerText || e.getAttribute("aria-label") || "").trim().slice(0, 30)).filter(Boolean);
  out.h1 = document.querySelector("h1")?.innerText.trim().replace(/\s+/g, " ");
  out.navLinks = [...document.querySelectorAll("nav a")].filter(vis).map((a) => a.innerText.trim()).filter(Boolean);
  out.fixed = [...document.querySelectorAll("body *")].filter((e) => getComputedStyle(e).position === "fixed" && vis(e)).map((e) => ({ c: (e.className + "").slice(0, 24), h: Math.round(e.getBoundingClientRect().height), b: Math.round(innerHeight - e.getBoundingClientRect().bottom) }));
  return out;
});
console.log(JSON.stringify({ ...r, errors }, null, 1));
if (OUT) {
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/fold.png` });
  const secs = r.sections.slice(0, 14);
  for (let i = 0; i < secs.length; i++) { await page.evaluate((y) => scrollTo(0, y), secs[i].y); await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/s${String(i).padStart(2, "0")}-${secs[i].id.replace(/\W/g, "") || "x"}.png` }); }
}
await browser.close();
