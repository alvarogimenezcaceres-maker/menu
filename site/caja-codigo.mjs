// Mesaverso Caja: the restaurant code a tablet needs to be linked (PUBLICAR.md → «Caja»).
//   node site/caja-codigo.mjs --init        creates .local/caja.env with a new CAJA_SECRET (once; never printed)
//   node site/caja-codigo.mjs gringo-bar    prints that restaurant's first code (to hand to the encargado)
// The same secret must be in Cloudflare: menu3d-demo → Settings → Variables and Secrets → CAJA_SECRET.
// After the encargado generates a new code from «Equipo», this script's code no longer works (by design).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { restaurantCode } from "./caja.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV = path.join(ROOT, ".local", "caja.env");
const arg = process.argv[2];

if (arg === "--init") {
  if (existsSync(ENV)) { console.log(`Ya existe ${ENV}. No lo piso: si lo cambiás, todos los códigos de los locales cambian.`); process.exit(0); }
  mkdirSync(path.dirname(ENV), { recursive: true });
  writeFileSync(ENV, `CAJA_SECRET=${randomBytes(32).toString("base64url")}\n`);
  console.log(`Listo: ${ENV}\nAhora copiá SOLO el valor (lo que va después de CAJA_SECRET=) en Cloudflare → menu3d-demo → Settings → Variables and Secrets → Add → Secret, nombre CAJA_SECRET.`);
  process.exit(0);
}
if (!arg || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(arg)) { console.log("Uso: node site/caja-codigo.mjs <slug-del-local>   (o --init la primera vez)"); process.exit(1); }
if (!existsSync(ENV)) { console.log("Falta el secreto: corré primero  node site/caja-codigo.mjs --init"); process.exit(1); }
const secret = /CAJA_SECRET=(.+)/.exec(readFileSync(ENV, "utf8"))?.[1]?.trim();
if (!secret) { console.log(`${ENV} no tiene CAJA_SECRET.`); process.exit(1); }
console.log(`Código del local ${arg}: ${await restaurantCode(secret, arg, "0")}`);
console.log(`La tablet se vincula en: https://menu3d-demo.alvarogimenezcaceres.workers.dev/${arg}/caja/`);
