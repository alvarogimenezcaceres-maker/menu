// node validate.mjs <model.glb> <report.json>  — Khronos glTF-Validator; exits 1 on errors
import { readFileSync, writeFileSync } from "node:fs";
import validator from "gltf-validator";
const [glb, out] = process.argv.slice(2);
const r = await validator.validateBytes(new Uint8Array(readFileSync(glb)));
writeFileSync(out, JSON.stringify({ ...r.issues, info: r.info }, null, 1));
console.log(`errors ${r.issues.numErrors} · warnings ${r.issues.numWarnings} · triangles ${r.info?.totalTriangleCount}`);
process.exit(r.issues.numErrors ? 1 : 0);
