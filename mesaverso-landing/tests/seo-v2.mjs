// Static SEO checks of the built v2 pages (no server needed): node build-v2.mjs && node tests/seo-v2.mjs
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
const DIST = path.resolve(import.meta.dirname, "..", "dist-v2");
let bad = 0;
const check = (n, ok, d = "") => { if (!ok) bad++; console.log(`${ok ? "OK  " : "FAIL"} ${n}${d ? " → " + d : ""}`); };
const pages = [["", "index.html"]];
for (const d of await readdir(DIST, { withFileTypes: true })) if (d.isDirectory() && !["m", "assets", "fonts", "brand", "vendor"].includes(d.name)) pages.push([d.name, `${d.name}/index.html`]);
const sitemap = await readFile(path.join(DIST, "sitemap.xml"), "utf8");
const FORBID = [/pedidosya/i, /rappi/i, /neolo/i, /garantiz\w+ (el )?(puesto|primer)/i];
for (const [slug, f] of pages) {
  const html = await readFile(path.join(DIST, f), "utf8");
  const t = `/${slug}`;
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
  const noindex = /noindex/.test(html) && !/index, follow/.test(html);
  check(`${t}: one h1`, (html.match(/<h1[ >]/g) || []).length === 1);
  check(`${t}: title 20-65 chars`, title.length >= 20 && title.length <= 65, `${title.length}`);
  check(`${t}: description 70-160 chars`, desc.length >= 70 && desc.length <= 160, `${desc.length}`);
  check(`${t}: canonical`, /<link rel="canonical" href="https:\/\/[^"]+"/.test(html));
  check(`${t}: in the sitemap`, sitemap.includes(`<loc>`) && (slug === "" ? true : sitemap.includes(`/${slug}/</loc>`)));
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ");
  check(`${t}: no «sin comisiones» alone`, !/sin comisi[oó]n(es)?/i.test(text.replace(/0 % de comisi[oó]n/gi, "")));
  check(`${t}: no third-party names`, FORBID.every((r) => !r.test(text)));
  if (slug && !["privacidad", "terminos", "reclamos"].includes(slug)) check(`${t}: 350+ words`, text.split(/\s+/).filter(Boolean).length >= 350);
}
process.exit(bad ? 1 : 0);
