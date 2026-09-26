// node optimize.mjs <in.glb> <out.glb>  — stage 6: web-ready GLB (glTF-Transform)
//
// The Blender export is flat-shaded (OpenMVS OBJ has no normals), so every triangle owns three
// vertices. Smooth normals shared by position let weld() merge them (~4x fewer vertices, ~70% smaller
// file) with no visible change, since lighting is baked into the photo texture.
// The texture stays at 2048 px (1024 looks blurry on phones) as JPEG, and there is no mesh compression:
// the GLB requires no extensions, because Android Scene Viewer only documents KHR_materials_unlit and
// KHR_texture_transform (no Draco, meshopt or WebP).
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, textureCompress, weld } from "@gltf-transform/functions";
import sharp from "sharp";

const [src, dst] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);

// Area-weighted normals averaged over every vertex at the same position, so UV seams don't show
// lighting cracks (a plain per-index average would stop at each texture-atlas border).
function smoothNormals(prim) {
  const pos = prim.getAttribute("POSITION"), nrm = prim.getAttribute("NORMAL"), idx = prim.getIndices();
  if (!pos || !nrm || !idx) return;
  const P = pos.getArray(), I = idx.getArray(), n = pos.getCount();
  const groups = new Map(), group = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const key = `${P[3 * i]},${P[3 * i + 1]},${P[3 * i + 2]}`;
    if (!groups.has(key)) groups.set(key, groups.size);
    group[i] = groups.get(key);
  }
  const acc = new Float64Array(groups.size * 3);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; // length = 2 × area
    for (const v of [I[t], I[t + 1], I[t + 2]]) {
      const g = group[v] * 3;
      acc[g] += nx; acc[g + 1] += ny; acc[g + 2] += nz;
    }
  }
  const N = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const g = group[i] * 3, len = Math.hypot(acc[g], acc[g + 1], acc[g + 2]) || 1;
    N[3 * i] = acc[g] / len; N[3 * i + 1] = acc[g + 1] / len; N[3 * i + 2] = acc[g + 2] / len;
  }
  nrm.setArray(N);
}

for (const mesh of doc.getRoot().listMeshes()) mesh.listPrimitives().forEach(smoothNormals);

await doc.transform(
  dedup(),
  weld(),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: "jpeg", resize: [2048, 2048] }),
);
await io.write(dst, doc);
