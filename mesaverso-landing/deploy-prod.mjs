// Builds the v2 landing for production (indexable, refuses while the owner data is incomplete) and deploys it.
//   OWNER_TITULAR=… OWNER_RUC=… OWNER_DOMICILIO=… OWNER_CORREO=… OWNER_CORREO_DATOS=… OWNER_VIGENCIA=dd/mm/aaaa node deploy-prod.mjs
// Needs `npx wrangler login` on this machine. Never run it without the owner's OK.
import { spawnSync } from "node:child_process";

const run = (cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, ...env } });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run("node", ["build-v2.mjs"], { PUBLISH: "1", SITE_URL: "https://mesaverso.app" });
run("npx", ["-y", "wrangler@4", "deploy", "-c", "wrangler.prod.jsonc"]);
console.log("Publicado: https://mesaverso.app");
