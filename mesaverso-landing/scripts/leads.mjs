// Prints the demo requests saved by the form (production KV), newest first.
//   npm run leads            (needs `npx wrangler login` on this machine)
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = (...args) => {
  const r = spawnSync("npx", ["-y", "wrangler@4", ...args], { cwd: ROOT, encoding: "utf8", shell: process.platform === "win32" });
  if (r.status !== 0) { console.error(r.stderr); process.exit(r.status ?? 1); }
  return r.stdout;
};

const keys = JSON.parse(wrangler("kv", "key", "list", "--binding", "LEADS", "--remote", "--prefix", "lead:"))
  .map((k) => k.name)
  .sort()
  .reverse();
if (!keys.length) console.log("Todavía no hay solicitudes.");
for (const k of keys) {
  const l = JSON.parse(wrangler("kv", "key", "get", "--binding", "LEADS", "--remote", k));
  console.log(`\n${l.at}  ${l.business} (${l.type})\n  ${l.name} · WhatsApp ${l.phone}${l.message ? `\n  «${l.message}»` : ""}`);
}
