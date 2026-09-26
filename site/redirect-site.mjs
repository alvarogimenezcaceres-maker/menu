// Builds the tiny site GitHub Pages serves now: every old URL forwards to the Cloudflare menus,
// keeping the table (?table=N) and the open dish (#slug) so printed or shared links keep working.
//   node site/redirect-site.mjs   → dist-redirect/
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "dist-redirect");
const NEW_BASE = (process.env.CF_SITE_URL || "https://menu3d-demo.alvarogimenezcaceres.workers.dev/").replace(/\/?$/, "/");
const OLD_PREFIX = "/menu"; // GitHub Pages project path: https://<user>.github.io/menu/

// target: a fixed new path, or null to map the old path generically (404 fallback)
const page = target => {
  const fixed = target === null ? null : NEW_BASE + target;
  const js = fixed
    ? `location.replace(${JSON.stringify(fixed)} + location.search + location.hash);`
    : `location.replace(${JSON.stringify(NEW_BASE.slice(0, -1))} + (location.pathname.replace(/^\\${OLD_PREFIX}/, "") || "/") + location.search + location.hash);`;
  const href = fixed || NEW_BASE;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>El menú se mudó</title>
<link rel="canonical" href="${href}">
<meta http-equiv="refresh" content="1;url=${href}">
<script>${js}</script>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#121110;color:#f3ede3;font:16px/1.5 system-ui,sans-serif;padding:16px;text-align:center}a{color:#ffb943}</style>
</head><body><p>El menú se mudó a una nueva dirección.<br><a href="${href}">Abrir el menú</a></p></body></html>
`;
};

await rm(OUT, { recursive: true, force: true });
const pages = {
  "index.html": "",
  "filigrana/index.html": "filigrana/",
  "filigrana/qr/index.html": "filigrana/qr/",
  "404.html": null,
};
for (const [file, target] of Object.entries(pages)) {
  await mkdir(path.dirname(path.join(OUT, file)), { recursive: true });
  await writeFile(path.join(OUT, file), page(target));
}
await writeFile(path.join(OUT, ".nojekyll"), "");
console.log(`Redireccionador listo → dist-redirect/ (destino ${NEW_BASE})`);
