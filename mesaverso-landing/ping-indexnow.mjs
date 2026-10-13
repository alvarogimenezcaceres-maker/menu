// Tells IndexNow search engines (Bing, Yandex, Naver, Seznam...) which URLs are new or changed. Run after `npm run deploy:prod`.
//   node ping-indexnow.mjs            (reads the URLs from dist-v2/sitemap.xml)
import { readFile } from "node:fs/promises";
import path from "node:path";
const DIST = path.join(import.meta.dirname, "dist-v2");
const HOST = "mesaverso.app";
const key = (await readFile(path.join(import.meta.dirname, "src-v2", "indexnow.key"), "utf8")).trim();
const xml = await readFile(path.join(DIST, "sitemap.xml"), "utf8");
const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => new URL(u).host === HOST);
const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${key}.txt`, urlList }),
});
console.log(`IndexNow: ${urlList.length} URLs → HTTP ${res.status}`);
