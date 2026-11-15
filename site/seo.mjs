// Search and AI discoverability for the public menus (used by build.mjs): schema.org JSON-LD, static
// crawlable HTML (dish names and prices without JavaScript), intent pages per cuisine/zone, llms.txt,
// robots.txt and the sitemap. Only real data from seed/: nothing here invents ratings, addresses or claims.

// slugs that are never indexed, listed in llms.txt or recommended (demo is a fake restaurant)
export const HIDDEN_SLUGS = new Set(["demo"]);
export const isHidden = slug => HIDDEN_SLUGS.has(slug) || /^demo(-|$)/.test(slug);

// crawlers explicitly welcomed in robots.txt (search engines and AI search/answer assistants)
export const CRAWLERS = ["Googlebot", "Bingbot", "OAI-SearchBot", "ChatGPT-User", "GPTBot", "PerplexityBot",
  "Perplexity-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "Google-Extended", "Applebot", "Applebot-Extended", "DuckDuckBot"];
const DISALLOW = ["/*/caja/", "/*/qr/", "/api/", "/e", "/demo/", "/directorio/demo/"];

export const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const ldJson = v => JSON.stringify(v).replace(/</g, "\\u003c");
export const slugify = s => String(s || "").toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const gs = n => "Gs. " + Math.round(Number(n)).toLocaleString("es-PY").replace(/,/g, ".");
const cuisinesOf = r => (Array.isArray(r.cuisine) ? r.cuisine : r.cuisine ? [r.cuisine] : []).filter(Boolean);
const phone = v => { const d = String(v || "").replace(/\D/g, ""); return d ? "+" + (d.startsWith("0") ? "595" + d.slice(1) : d) : undefined; };

// the dishes a crawler may see: same filter as the public menu (no drafts, priced only)
export function visibleCategories(m) {
  return (m.categories || []).map(c => ({ ...c, dishes: (c.dishes || []).filter(d => d.status !== "draft" && d.price != null) }))
    .filter(c => c.dishes.length);
}

export function priceRange(m) {
  const prices = visibleCategories(m).flatMap(c => c.dishes.map(d => Number(d.price))).filter(p => p > 0);
  if (!prices.length) return undefined;
  const lo = Math.min(...prices), hi = Math.max(...prices);
  return lo === hi ? gs(lo) : `${gs(lo)} – ${gs(hi)}`;
}

// where the restaurant is, only from fields that exist in menu.json (address, city, neighborhood/barrio, geo)
export function place(r) {
  const city = r.city || r.address?.city || r.legal?.city;
  const barrio = r.neighborhood || r.barrio || r.address?.neighborhood;
  const street = typeof r.address === "string" ? r.address : r.address?.street;
  return { city, barrio, street };
}

const DAYS = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
function openingHours(r) {
  const hours = r.ordering?.hours;
  if (!Array.isArray(hours) || !hours.length) return undefined;
  return hours.filter(h => h.open && h.close && h.days?.length).map(h => ({
    "@type": "OpeningHoursSpecification", dayOfWeek: h.days.map(d => DAYS[d]).filter(Boolean), opens: h.open, closes: h.close,
  }));
}

// full Restaurant node: menu URL, cuisine, price range, phone already public in the menu, hours, address/geo if present
export function restaurantLd(m, { menuUrl, pageUrl, image, withMenu = true }) {
  const r = m.restaurant || {}, cur = r.currency || "PYG";
  const { city, barrio, street } = place(r);
  const node = {
    "@type": "Restaurant", "@id": menuUrl + "#restaurant", name: r.name, url: pageUrl || menuUrl,
    description: r.description || r.tagline || undefined, image, servesCuisine: cuisinesOf(r),
    priceRange: priceRange(m), currenciesAccepted: cur, telephone: phone(r.whatsapp),
    openingHoursSpecification: openingHours(r),
    address: city || street ? { "@type": "PostalAddress", streetAddress: street, addressLocality: barrio ? `${barrio}, ${city || ""}`.replace(/, $/, "") : city, addressCountry: "PY" } : undefined,
    geo: r.geo?.lat != null && r.geo?.lng != null ? { "@type": "GeoCoordinates", latitude: r.geo.lat, longitude: r.geo.lng } : undefined,
    acceptsReservations: r.reservations === true ? true : undefined,
  };
  node.hasMenu = withMenu ? {
    "@type": "Menu", "@id": menuUrl + "#menu", name: `Menú de ${r.name}`, url: menuUrl, inLanguage: "es",
    hasMenuSection: visibleCategories(m).map(c => ({
      "@type": "MenuSection", name: c.name, description: c.description || undefined,
      hasMenuItem: c.dishes.map(d => ({
        "@type": "MenuItem", name: d.name, description: d.description || undefined,
        offers: { "@type": "Offer", price: d.price, priceCurrency: cur, availability: d.soldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock" },
      })),
    })),
  } : menuUrl;
  return node;
}

export const breadcrumbLd = items => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })),
});

export const graph = (...nodes) => ldJson({ "@context": "https://schema.org", "@graph": nodes.filter(Boolean) });

// static menu for crawlers and no-JS readers: every category, dish and price as plain HTML
export function menuHtml(m, { headingLevel = 2 } = {}) {
  const h = `h${headingLevel}`, hh = `h${headingLevel + 1}`;
  return visibleCategories(m).map(c => `<section><${h}>${esc(c.name)}</${h}><ul>${c.dishes.map(d =>
    `<li><${hh} style="display:inline;font-size:inherit">${esc(d.name)}</${hh}> — ${gs(d.price)}${d.description ? `<br><small>${esc(d.description)}</small>` : ""}</li>`).join("")}</ul></section>`).join("\n");
}

// cuisine and zone groups with ≥1 real restaurant (no thin pages)
export function intentGroups(list) {
  const cuisine = new Map(), zona = new Map();
  for (const x of list) {
    for (const c of cuisinesOf(x.menu.restaurant)) {
      const k = slugify(c); if (!k) continue;
      if (!cuisine.has(k)) cuisine.set(k, { slug: k, label: c, items: [] });
      cuisine.get(k).items.push(x);
    }
    const { city, barrio } = place(x.menu.restaurant || {});
    for (const z of [city, barrio].filter(Boolean)) {
      const k = slugify(z);
      if (!zona.has(k)) zona.set(k, { slug: k, label: z, items: [] });
      if (!zona.get(k).items.includes(x)) zona.get(k).items.push(x);
    }
  }
  const sort = m => [...m.values()].sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label, "es"));
  return { cuisine: sort(cuisine), zona: sort(zona) };
}

// where to say the restaurants are: the shared city if every one has it, else just Paraguay
export const whereOf = items => {
  const cities = new Set(items.map(x => place(x.menu.restaurant || {}).city).filter(Boolean));
  return cities.size === 1 && items.every(x => place(x.menu.restaurant || {}).city) ? [...cities][0] : "Paraguay";
};

// dishes of a restaurant that match a cuisine word (by category or dish name), for intent pages
export function matchingDishes(m, label, max = 6) {
  const n = slugify(label).replace(/s$/, "");
  const hit = s => slugify(s).includes(n);
  const out = [];
  for (const c of visibleCategories(m)) for (const d of c.dishes) if (hit(c.name) || hit(d.name)) out.push(d);
  return out.slice(0, max);
}

export function robotsTxt(base) {
  const lines = ["# Mesaverso: menús públicos de restaurantes de Paraguay. Buscadores y asistentes de IA son bienvenidos.", ""];
  for (const ua of [...CRAWLERS, "*"]) {
    lines.push(`User-agent: ${ua}`, "Allow: /", ...DISALLOW.map(d => `Disallow: ${d}`), "");
  }
  lines.push(`Sitemap: ${base}/sitemap.xml`, "");
  return lines.join("\n");
}

export function sitemapXml(entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
    entries.map(([loc, lastmod]) => `  <url><loc>${esc(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>\n`;
}

// a simple shared page for intent pages (cuisine / zone): own CSS, no third-party resources
export function intentPage({ title, description, canonical, h1, intro, body, ld }) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:locale" content="es_PY">
<script type="application/ld+json">${ld}</script>
<style>
body{margin:0;background:#0e1014;color:#f3ede3;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px 48px}a{color:#ffd6a5}h1{font-size:1.7rem;line-height:1.2}
nav.crumbs{font-size:.85rem;opacity:.8}article{border-top:1px solid #2a2d33;padding:16px 0}article h2{margin:0 0 4px}
ul{padding-left:18px}small{opacity:.75}.cta{display:inline-block;margin-top:8px;font-weight:700}footer{opacity:.7;font-size:.85rem;margin-top:32px}
</style>
</head>
<body>
<main>
<nav class="crumbs"><a href="/directorio/">Restaurantes</a> › ${esc(h1)}</nav>
<h1>${esc(h1)}</h1>
<p>${esc(intro)}</p>
${body}
<footer><a href="/directorio/">Ver todos los restaurantes</a> · Mesaverso</footer>
</main>
</body>
</html>
`;
}
