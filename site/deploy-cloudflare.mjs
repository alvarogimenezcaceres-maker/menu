// Build the static menus and deploy them to Cloudflare Workers (static assets, free plan).
//   node site/deploy-cloudflare.mjs          (needs `npx wrangler login` once on this machine,
//                                             or CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID on a server)
// CF_SITE_URL overrides the public URL (e.g. when a custom domain is added). The QR codes encode it.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_URL = process.env.CF_SITE_URL || "https://menu3d-demo.alvarogimenezcaceres.workers.dev/";

const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, SITE_URL } });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run("node", ["build.mjs"], path.join(ROOT, "site"));
run("npx", ["-y", "wrangler@4", "deploy"], ROOT);
console.log(`Publicado en Cloudflare: ${SITE_URL}`);
