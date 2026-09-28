// End-to-end QA against a running site (local `npm run dev` or the public URL).
//   node tests/qa.mjs [baseUrl] [--no-submit]
// Uses the locally installed Chrome (playwright-core, channel "chrome"). Screenshots → tests/out/.
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MESAVERSO_WHATSAPP, WHATSAPP_MESSAGES, PRICES, formatGs } from "../site.config.mjs";

const BASE = (process.argv[2] || "http://127.0.0.1:8788").replace(/\/$/, "");
const SUBMIT = !process.argv.includes("--no-submit");
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "out");
await mkdir(OUT, { recursive: true });

const results = [];
const ok = (name, pass, info = "") => { results.push({ name, pass, info }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${info ? "  · " + info : ""}`); };

const browser = await chromium.launch({ channel: "chrome" });
const consoleErrors = [];
const watch = (page, tag) => {
  page.on("console", (m) => { if (m.type() === "error" && !/status of 422/.test(m.text())) consoleErrors.push(`[${tag}] ${m.text()}`); });
  page.on("pageerror", (e) => consoleErrors.push(`[${tag}] ${e.message}`));
};

/* ---------- responsive sweep ---------- */
const VIEWPORTS = [[360, 740], [390, 844], [430, 932], [768, 1024], [1024, 768], [1280, 800], [1440, 900], [1920, 1080]];
for (const [w, h] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 768, hasTouch: w < 1024, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  watch(page, `${w}px`);
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  const r = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const off = [];
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || el.closest("[hidden],.hp,.sr-only,svg defs,symbol")) continue;
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      // Clipped by an overflow:clip/hidden ancestor that itself fits? Then it's not visible overflow.
      let clipped = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const pc = getComputedStyle(p);
        if (/(clip|hidden|auto|scroll)/.test(pc.overflowX)) { const pb = p.getBoundingClientRect(); if (pb.left >= -1 && pb.right <= vw + 1) { clipped = true; break; } }
      }
      if (!clipped && (b.right > vw + 1 || b.left < -1)) off.push(`${el.tagName.toLowerCase()}.${[...el.classList].join(".")} [${Math.round(b.left)},${Math.round(b.right)}]`);
    }
    // Text that overflows its own box horizontally (clipped labels).
    const clippedText = [];
    for (const el of document.querySelectorAll("h1,h2,h3,p,a,button,li,dt,dd,strong,span,label,summary")) {
      if (el.closest("[hidden],.hp,.sr-only,.app-cats,.item__txt small")) continue;
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== "visible" && el.clientWidth > 0) clippedText.push(el.textContent.trim().slice(0, 40));
    }
    // Small touch targets outside the phone mockups.
    const small = [];
    if (vw < 1024) for (const el of document.querySelectorAll("a[href],button,summary,input,select,textarea")) {
      // Links inside a sentence are exempt (WCAG 2.5.8 "inline" exception).
      if (el.closest("[hidden],.hp,.phone,.sr-only,.nav__links,.skip") || getComputedStyle(el).display === "none" || (el.tagName === "A" && el.parentElement.tagName === "P" && getComputedStyle(el).display === "inline")) continue;
      const b = el.getBoundingClientRect();
      if (b.width && (b.height < 44 || b.width < 44)) small.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)}" ${Math.round(b.width)}×${Math.round(b.height)}`);
    }
    // Phone mockups fully inside the viewport horizontally.
    const phones = [...document.querySelectorAll(".phone")].map((p) => p.getBoundingClientRect()).filter((b) => b.left < -1 || b.right > vw + 1).length;
    return { scrollW: document.documentElement.scrollWidth, vw, off: off.slice(0, 8), offCount: off.length, clippedText: clippedText.slice(0, 8), small: small.slice(0, 12), phones };
  });
  ok(`${w}px no horizontal scroll`, r.scrollW <= r.vw, `scrollWidth ${r.scrollW} / ${r.vw}`);
  // Brand manual 5B: Luz Cálida ≤ ~8% of every screen; no brand red/orange/green, no gradients.
  const brand = await page.evaluate(async () => {
    const LUZ = "rgb(255, 214, 165)";
    const shares = [];
    const H = document.documentElement.scrollHeight;
    for (let y = 0; y < H; y += innerHeight) {
      scrollTo(0, y); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      let area = 0;
      for (const el of document.querySelectorAll("body *")) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || el.closest("[hidden],.sr-only") || +cs.opacity === 0) continue;
        const b = el.getBoundingClientRect();
        const vis = Math.max(0, Math.min(b.right, innerWidth) - Math.max(b.left, 0)) * Math.max(0, Math.min(b.bottom, innerHeight) - Math.max(b.top, 0));
        if (!vis) continue;
        if (cs.backgroundColor === LUZ) area += vis;
        else if (cs.color === LUZ && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) area += vis * 0.35; // glyph ink ≈ 35% of the text box
      }
      shares.push(area / (innerWidth * innerHeight));
    }
    scrollTo(0, 0);
    const banned = [];
    const hue = (c) => { const m = c.match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?/); if (!m || m[4] === "0") return null; const [r, g, bl] = [m[1], m[2], m[3]].map((v) => v / 255); const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl), d = mx - mn; if (d < .25 || mx < .3) return null; const h = mx === r ? ((g - bl) / d) % 6 : mx === g ? (bl - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
    for (const el of document.querySelectorAll("body *")) {
      // Food imagery keeps its real colour; form error states are functional, not brand colour.
      if (el.closest(".feature__media,.three__viewer,[hidden],.field__err,.form__summary,.form__status.is-err")) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none") continue;
      if (/gradient/.test(cs.backgroundImage)) banned.push("gradient " + el.className);
      for (const prop of ["color", "backgroundColor", "borderTopColor", "fill", "stroke"]) {
        const h = hue(cs[prop]);
        if (h === null) continue;
        if (h < 25 || h > 330 || (h >= 80 && h <= 170)) banned.push(`${prop} ${cs[prop]} .${[...el.classList].join(".")}`);
      }
    }
    return { max: Math.max(...shares), banned: [...new Set(banned)].slice(0, 6) };
  });
  ok(`${w}px Luz Cálida ≤ 8% of every screen`, brand.max <= 0.08, `max ${(brand.max * 100).toFixed(1)}%`);
  ok(`${w}px no brand red/orange/green, no gradients`, brand.banned.length === 0, brand.banned.join(" | "));
  ok(`${w}px no element outside viewport`, r.offCount === 0, r.off.join(" | "));
  ok(`${w}px phone mockups inside viewport`, r.phones === 0);
  ok(`${w}px no clipped text`, r.clippedText.length === 0, r.clippedText.join(" | "));
  if (w < 1024) ok(`${w}px touch targets ≥44px`, r.small.length === 0, r.small.join(" | "));
  await page.screenshot({ path: path.join(OUT, `full-${w}.png`), fullPage: true });
  await ctx.close();
}

/* ---------- functional checks on a phone ---------- */
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
watch(page, "func");
const bodies = [];
page.on("response", async (res) => { try { const t = res.headers()["content-type"] || ""; if (/html|javascript|css|json|svg|text/.test(t)) bodies.push(await res.text()); } catch {} });
await page.goto(BASE + "/", { waitUntil: "networkidle" });

// WhatsApp links
const links = await page.$$eval("a[href*='wa.me']", (as) => as.map((a) => ({ href: a.href, text: a.textContent.trim(), track: a.dataset.track, where: a.dataset.trackWhere || "" })));
const expected = new Set(Object.values(WHATSAPP_MESSAGES));
const bad = links.filter((l) => { const u = new URL(l.href); return u.pathname !== `/${MESAVERSO_WHATSAPP}` || !expected.has(u.searchParams.get("text")); });
ok("all WhatsApp links → 595984900323 with a known message", links.length > 0 && bad.length === 0, `${links.length} links; bad: ${bad.map((b) => b.href).join(", ")}`);
const msgOf = (sel) => page.$eval(sel, (a) => new URL(a.href).searchParams.get("text"));
ok("hero demo CTA message", (await msgOf('.hero a[data-track="hero_demo_click"]')) === WHATSAPP_MESSAGES.demo);
ok("monthly plan CTA message", (await msgOf('a[data-track="pricing_digital_click"][data-track-where="monthly"]')) === WHATSAPP_MESSAGES.planMonthly);
ok("annual plan CTA message", (await msgOf('a[data-track="pricing_digital_click"][data-track-where="annual"]')) === WHATSAPP_MESSAGES.planAnnual);
ok("3D pack CTA message", (await msgOf('.pricing a[data-track="pricing_3d_click"]')) === WHATSAPP_MESSAGES.pack3d);
ok("final WhatsApp CTA message", (await msgOf('.final a[data-track-where="final"]')) === WHATSAPP_MESSAGES.general);
ok("links are URL-encoded", links.every((l) => !/\s/.test(l.href) && l.href.includes("%20")));
const allNumbers = (await page.content()).match(/\b5959\d{8}\b/g) || [];
ok("no other phone number in the page", allNumbers.every((n) => n === MESAVERSO_WHATSAPP), [...new Set(allNumbers)].join(","));

// Privacy: the lead destination never reaches the browser
const text = await page.evaluate(() => document.body.innerText);
ok("no email address visible or shipped", !/@gmail.com|mailto:/i.test(bodies.join("\n") + text));

// Remote ordering is stated before pricing
const order = await page.evaluate(() => {
  const y = (sel) => document.querySelector(sel).getBoundingClientRect().top + scrollY;
  return { claim: y("#how-title"), journey: y(".journey"), plans: y("#planes") };
});
ok("remote-order message appears before pricing", order.journey < order.claim && order.claim < order.plans);
ok("remote claim text", text.includes("Tu cliente puede pedir desde donde esté."));

// Pricing
const need = [formatGs(PRICES.planMonthly), formatGs(PRICES.planAnnual), formatGs(PRICES.implementation), formatGs(PRICES.pack3dDish), formatGs(PRICES.firstYearMonthly), formatGs(PRICES.annualSaving), "Pago único", `Mínimo ${PRICES.minMonths} meses`, "12 meses al precio de 10", "Incluida en el plan anual", "por plato, pago único", "Sin comisiones por pedido".toUpperCase()];
const upper = text.replace(/ /g, " ");
const missing = need.filter((s) => !upper.includes(s.replace(/ /g, " ")) && !upper.toUpperCase().includes(s.replace(/ /g, " ").toUpperCase()));
ok("all prices and plan terms present", missing.length === 0, missing.join(" | "));
const noBadges = !/más vendido|favorito|más elegido|recomendado|preferido/i.test(text);
ok("no unsupported plan badges", noBadges);
const risky = (text.match(/[^.\n]*\b(caja|POS|cocina|pago online|pagos integrados|factura|reserva|aument[a-z]* (tus )?ventas|conversi[oó]n|testimonio)\b[^.\n]*/gi) || []);
ok("no unsupported product claims (keyword scan)", risky.length === 0, risky.join(" | "));

// Mobile menu
await page.click(".nav__toggle");
ok("mobile menu opens", await page.isVisible("#menu-movil"));
ok("mobile menu aria-expanded", (await page.getAttribute(".nav__toggle", "aria-expanded")) === "true");
await page.keyboard.press("Escape");
ok("mobile menu closes with Escape", !(await page.isVisible("#menu-movil")));
await page.click(".nav__toggle");
await page.click('#menu-movil a[href="/#planes"]');
await page.waitForTimeout(2500);
const navState = await page.evaluate(() => ({ hash: location.hash, top: Math.round(document.querySelector("#planes").getBoundingClientRect().top), open: !document.querySelector("#menu-movil").hidden, overflow: document.body.style.overflow }));
ok("mobile menu link closes menu and navigates", !navState.open && navState.hash === "#planes" && Math.abs(navState.top) < 120 && navState.overflow === "", JSON.stringify(navState));

// Anchors
for (const id of ["como-funciona", "desde-donde-esten", "whatsapp", "3d", "planes", "faq", "demo"]) ok(`anchor #${id} exists`, (await page.$(`[id="${id}"]`)) !== null);

// Demo menu
await page.evaluate(() => scrollTo(0, 0));
await page.click('[data-inc="burger"]');
ok("demo add updates count", (await page.textContent("[data-demo-count]")) === "4");
ok("WhatsApp chip mirrors the order", (await page.textContent("[data-demo-wa-chip-count]")) === "4 productos");
await page.fill("[data-demo-search]", "limon");
const vis = await page.evaluate(() => [...document.querySelectorAll(".item")].filter((i) => !i.hidden).map((i) => i.dataset.id));
const sv = await page.evaluate(() => location.href + "|" + document.querySelector("[data-demo-search]").value + "|" + [...document.querySelectorAll(".chip")].map((c) => c.className).join(","));
ok("demo search filters", vis.length === 1 && vis[0] === "limonada", vis.join(",") + " search=" + sv);
await page.fill("[data-demo-search]", "");
await page.click('[data-cat="bebidas"]');
ok("demo category filters", await page.evaluate(() => [...document.querySelectorAll(".item")].filter((i) => !i.hidden).every((i) => i.dataset.cat === "bebidas")));
await page.click('[data-cat="todo"]');
await page.click("[data-demo-open]");
ok("demo order sheet opens", await page.isVisible("[data-demo-sheet]"));
await page.click("[data-demo-waiter]");
ok("demo waiter view", await page.isVisible("[data-demo-waiter-view]") && (await page.textContent("[data-demo-waiter-view]")).includes("Hamburguesa clásica"));
await page.click("[data-demo-waiter-close]");
await page.click("[data-demo-open]");
await page.click("[data-demo-wa]");
await page.waitForTimeout(900);
const msg = await page.textContent("[data-wa-message]");
ok("no launch-promo anchor or monthly 3D plan left", !/\d+% OFF|Promoción de lanzamiento|Plan Menú 3D|270\.000/.test(text) && (await page.$(".pricing s")) === null);
ok("pricing has a worked example", text.includes("Ejemplo: ¿cuánto pagás el primer año?"));
ok("demo WhatsApp fills chat message", msg.includes("1 × Hamburguesa clásica") && msg.includes("¿Delivery o pick up?"));

// FAQ
const sum = page.locator(".faq__q").first();
await sum.scrollIntoViewIfNeeded();
await sum.click();
const faqState = () => page.$eval(".faq__q", (b) => ({ exp: b.getAttribute("aria-expanded"), shown: !document.getElementById(b.getAttribute("aria-controls")).hidden }));
let fs = await faqState();
ok("FAQ opens (button + aria-expanded)", fs.exp === "true" && fs.shown, JSON.stringify(fs));
await sum.focus();
await page.keyboard.press("Enter");
fs = await faqState();
ok("FAQ toggles with keyboard", fs.exp === "false" && !fs.shown, JSON.stringify(fs));

// 3D inside the phone: the featured dish loads its real model on demand
await page.evaluate(() => scrollTo(0, 0));
await page.locator("[data-3d-phone-load]").scrollIntoViewIfNeeded();
await page.click("[data-3d-phone-load]");
try { await page.waitForSelector("[data-3d-phone].is-live", { timeout: 30000 }); ok("phone 3D dish loads on demand", true); } catch { ok("phone 3D dish loads on demand", false); }
await page.screenshot({ path: path.join(OUT, "phone-3d-390.png") });

// 3D viewer
await page.locator("[data-3d-load]").scrollIntoViewIfNeeded();
await page.click("[data-3d-load]");
try { await page.waitForSelector("[data-3d].is-live", { timeout: 30000 }); ok("3D model loads on demand", true); } catch { ok("3D model loads on demand", false); }
await page.screenshot({ path: path.join(OUT, "3d-390.png") });

// Form: validation
await page.locator("#demo").scrollIntoViewIfNeeded();
await page.click("[data-form-submit]");
ok("form shows error summary on empty submit", await page.isVisible("[data-form-summary]"));
ok("form marks invalid fields", (await page.$$("[aria-invalid=true]")).length === 4);
ok("server rejects invalid lead", (await page.evaluate(async () => (await fetch("/api/lead", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "x" }) })).status)) === 422);
ok("server rejects cross-origin", (await (await fetch(BASE + "/api/lead", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" })).status) === 403);
ok("server rejects GET", (await (await fetch(BASE + "/api/lead")).status) === 405);
if (SUBMIT) {
  await page.fill("#f-name", "Prueba QA");
  await page.fill("#f-business", "Pizzería de prueba (QA automático)");
  await page.fill("#f-phone", "0981 000 000");
  await page.selectOption("#f-type", "Pizzería");
  await page.fill("#f-msg", "Envío automático de QA, ignorar.");
  await page.waitForTimeout(2700);
  let posts = 0;
  page.on("request", (r) => { if (r.url().endsWith("/api/lead") && r.method() === "POST") posts++; });
  // Two submits in the same tick: the second must be ignored while the first is in flight.
  const busy = await page.evaluate(() => { const f = document.querySelector("[data-lead-form]"); f.requestSubmit(); const b = f.classList.contains("is-sending"); f.requestSubmit(); return b; });
  await page.waitForSelector(".form__status.is-ok, .form__status.is-err", { timeout: 15000, state: "attached" }).catch(() => {});
  const st = await page.textContent("[data-form-status]");
  ok("form loading state", busy);
  ok("no double submission", posts === 1, `${posts} POSTs`);
  ok("form submits and shows success", st.includes("Recibimos tu solicitud"), st.trim().slice(0, 120) + " summary=" + (await page.textContent("[data-form-summary]")).slice(0, 120));
  await page.screenshot({ path: path.join(OUT, "form-390.png") });
}

// Keyboard: skip link is first focusable
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.keyboard.press("Tab");
ok("skip link first in tab order", (await page.evaluate(() => document.activeElement.className)) === "skip");

// Assets and routes
for (const p of ["/styles.css", "/app.js", "/vendor/model-viewer.min.js", "/assets/torta-de-zanahoria-3d.glb", "/assets/og.png", "/favicon.svg", "/robots.txt", "/sitemap.xml", "/gracias.html"]) {
  const res = await fetch(BASE + p);
  ok(`GET ${p} → 200`, res.status === 200, String(res.status));
}
ok("unknown page → 404", (await fetch(BASE + "/no-existe")).status === 404);

/* ---------- SEO: every URL in the sitemap ---------- */
{
  const PREVIEW_RUN = process.argv.includes("--preview");
  const sm = await (await fetch(BASE + "/sitemap.xml")).text();
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const origin = new URL(locs[0] || "https://x").origin;
  ok("sitemap lists the canonical pages", locs.length >= 2 && locs.every((l) => l.startsWith(origin) && !/localhost|127\.0|--|preview/.test(l)), locs.join(" "));
  const robots = await (await fetch(BASE + "/robots.txt")).text();
  ok("robots.txt allows the site and names the sitemap", PREVIEW_RUN ? /Disallow: \//.test(robots) : /Allow: \//.test(robots) && robots.includes(`Sitemap: ${origin}/sitemap.xml`) && !/Disallow: \/(\s|$)/m.test(robots), robots.replace(/\n/g, " | "));
  const seen = new Set();
  for (const loc of locs) {
    const pathName = new URL(loc).pathname;
    const res = await fetch(BASE + pathName);
    const html = await res.text();
    const tag = (re) => (html.match(re) || [])[1];
    const title = tag(/<title>([^<]*)<\/title>/), desc = tag(/<meta name="description" content="([^"]*)"/), canon = tag(/<link rel="canonical" href="([^"]*)"/);
    const robotsMeta = tag(/<meta name="robots" content="([^"]*)"/) || "";
    const h1s = (html.match(/<h1[\s>]/g) || []).length;
    ok(`${pathName} → 200`, res.status === 200, String(res.status));
    ok(`${pathName} title/description lengths`, title && title.length <= 60 && desc && desc.length >= 110 && desc.length <= 160, `${title?.length} / ${desc?.length}`);
    ok(`${pathName} one H1`, h1s === 1, String(h1s));
    ok(`${pathName} canonical = sitemap URL`, canon === loc, canon);
    ok(`${pathName} robots meta`, PREVIEW_RUN ? /noindex/.test(robotsMeta) : !/noindex/.test(robotsMeta) && !/noindex/i.test(res.headers.get("x-robots-tag") || ""), robotsMeta + " · " + res.headers.get("x-robots-tag"));
    ok(`${pathName} Open Graph`, [/og:title/, /og:description/, new RegExp(`og:url" content="${loc}"`), /og:image" content="https:[^"]+og\.png"/, /twitter:card" content="summary_large_image"/].every((r) => r.test(html)));
    // JSON-LD: parses, uses the stable origin, no ratings/reviews/LocalBusiness, FAQ matches the page
    let graph = [];
    try { graph = JSON.parse(tag(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/))["@graph"]; } catch {}
    const types = graph.map((n) => n["@type"]);
    const ldText = JSON.stringify(graph);
    ok(`${pathName} JSON-LD valid`, types.includes("Organization") && types.includes("WebSite") && types.includes("WebPage") && types.includes("Service") && (pathName === "/" || types.includes("BreadcrumbList")), types.join(","));
    ok(`${pathName} JSON-LD honest`, !/aggregateRating|"review"|LocalBusiness|sameAs/i.test(ldText) && [...ldText.matchAll(/https?:\/\/[^"\\]+/g)].every((m) => m[0].startsWith(origin) || m[0].startsWith("https://schema.org")), "");
    const faqNode = graph.find((n) => n["@type"] === "FAQPage");
    if (faqNode) {
      const visibleQ = [...html.matchAll(/class="faq__q"[^>]*>([^<]+)<\/button>/g)].map((m) => m[1]);
      ok(`${pathName} FAQPage = visible FAQ`, JSON.stringify(faqNode.mainEntity.map((q) => q.name)) === JSON.stringify(visibleQ), `${faqNode.mainEntity.length} vs ${visibleQ.length}`);
    }
    const imgs = [...html.matchAll(/<img[^>]*>/g)].map((m) => m[0]);
    ok(`${pathName} images have alt, width, height`, imgs.every((i) => /alt="/.test(i) && /width="/.test(i) && /height="/.test(i)), imgs.filter((i) => !/alt="/.test(i)).join(" "));
    ok(`${pathName} no email in HTML`, !/@gmail\.com|mailto:/i.test(html));
    for (const m of html.matchAll(/href="(\/[^"#?]*)/g)) seen.add(m[1]);
  }
  const broken = [];
  for (const href of seen) { const r = await fetch(BASE + href, { redirect: "manual" }); if (r.status !== 200) broken.push(`${href} ${r.status}`); }
  ok("internal links resolve (200, no redirects)", broken.length === 0, broken.join(" | "));
  // Inner pages on phones
  for (const w of [360, 390, 430]) {
    const c2 = await browser.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true });
    const p2 = await c2.newPage(); watch(p2, `landing ${w}px`);
    for (const loc of locs.slice(1)) {
      await p2.goto(BASE + new URL(loc).pathname, { waitUntil: "networkidle" });
      const r2 = await p2.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
      ok(`${new URL(loc).pathname} ${w}px no horizontal scroll`, r2.sw <= r2.vw, `${r2.sw}/${r2.vw}`);
    }
    await c2.close();
  }
}

/* ---------- logo animation ---------- */
{
  const still = await browser.newContext({ reducedMotion: "reduce" });
  const sp = await still.newPage(); await sp.goto(BASE + "/", { waitUntil: "networkidle" });
  const st = await sp.evaluate(() => { const d = document.querySelector(".nav .mv-dot"); return d.getAttribute("cx") + "," + d.getAttribute("cy"); });
  ok("logo static with reduced motion", st === "84,82", st);
  await still.close();
  const moving = await browser.newContext({ reducedMotion: "no-preference" });
  const mp = await moving.newPage(); await mp.goto(BASE + "/", { waitUntil: "networkidle" });
  const mv = await mp.evaluate(() => { const d = document.querySelector(".nav .mv-dot"); const a = d.querySelector("animateMotion"); return { cx: d.getAttribute("cx"), dur: a.getAttribute("dur"), started: (() => { try { return a.getStartTime() >= 0; } catch { return false; } })() }; });
  ok("logo animates every 8 s otherwise", mv.cx === "0" && mv.dur === "8s" && mv.started, JSON.stringify(mv));
  await moving.close();
}

/* ---------- brand files ---------- */
const BRAND_FILES = ["logo-mesaverso.svg", "logo-mesaverso-dark.svg", "logo-mesaverso-light.svg", "logo-mesaverso-black.svg", "logo-mesaverso-white.svg", "logo-mesaverso-small.svg", "isotype-mesaverso.svg", "isotype-mesaverso-light.svg", "isotype-mesaverso-mono.svg", "isotype-mesaverso-animated.svg", "app-icon-mesaverso.svg"];
const badBrand = [];
for (const f of BRAND_FILES) {
  const res = await fetch(`${BASE}/brand/${f}`);
  const t = await res.text();
  if (res.status !== 200 || !/image\/svg\+xml/.test(res.headers.get("content-type") || "") || !/^<svg [^>]*viewBox="[-\d. ]+"/.test(t) || !/<\/svg>\s*$/.test(t)) badBrand.push(`${f} ${res.status}`);
}
ok("brand SVG files served and well-formed", badBrand.length === 0, badBrand.join(" | "));
for (const p of ["/assets/apple-touch-icon.png", "/assets/icon-512.png", "/assets/icon-32.png", "/site.webmanifest"]) ok(`GET ${p} → 200`, (await fetch(BASE + p)).status === 200);
const logo = await page.evaluate(() => {
  const w = document.querySelector(".nav .mv-wordmark"); if (!w) return null;
  const m = w.querySelector("svg").getBoundingClientRect(), rest = w.querySelector(".mv-wordmark__rest");
  return { m: Math.round(m.width) + "×" + Math.round(m.height), shown: getComputedStyle(rest, "::after").content, text: w.textContent.trim() };
});
ok("navbar logo is [M]ESAVERSO (text for search engines: Mesaverso)", logo && logo.shown === '"ESAVERSO"' && logo.text === "Mesaverso" && !logo.m.startsWith("0"), JSON.stringify(logo));

ok("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 5).join(" | "));
await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
