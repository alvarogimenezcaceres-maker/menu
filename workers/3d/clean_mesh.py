# SPDX-License-Identifier: GPL-3.0-or-later  (imports bpy)
"""Stage 3 (docs/04 §13.2): isolate the dish from the reconstructed scene.

blender -b -P clean_mesh.py -- <in.ply> <out.ply> <transform.json> [--tris 40000]

- finds the table plane (RANSAC), keeps what stands on it inside the dish footprint
- keeps the largest connected piece, decimates to the target triangle count
- writes the mesh in the ORIGINAL coordinates (so OpenMVS can texture it from the photos)
  and the ground-alignment transform for finalize.py
"""
import json
import sys

import bmesh
import bpy
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
src, dst, tf_path = argv[0], argv[1], argv[2]
target_tris = int(argv[argv.index("--tris") + 1]) if "--tris" in argv else 40000
# capture geometry from COLMAP (pipeline.py): where the cameras look, which way is up, camera distance
vec = lambda name: np.array([float(x) for x in argv[argv.index(name) + 1].split(",")]) if name in argv else None
target, up_hint = vec("--target"), vec("--up")
reach = float(argv[argv.index("--reach") + 1]) if "--reach" in argv else None

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.ply_import(filepath=src)
obj = bpy.context.selected_objects[0]
me = obj.data
V = np.array([v.co[:] for v in me.vertices], dtype=np.float64)
print(f"input: {len(V)} verts, {len(me.polygons)} faces")

# --- RANSAC table plane (near the dish, roughly perpendicular to "up") ---
rng = np.random.default_rng(3)
near = np.linalg.norm(V - target, axis=1) < 0.8 * reach if target is not None else np.ones(len(V), bool)
pool = V[near]
sample = pool[rng.choice(len(pool), size=min(len(pool), 30000), replace=False)]
diag = np.linalg.norm(pool.max(0) - pool.min(0))
eps = diag * 0.004
def ransac(pts):
    best = (0, None, None)
    for _ in range(1500):
        a, b, c = pts[rng.choice(len(pts), 3, replace=False)]
        n = np.cross(b - a, c - a)
        if np.linalg.norm(n) < 1e-12:
            continue
        n /= np.linalg.norm(n)
        if up_hint is not None:
            if abs(n @ up_hint) < np.cos(np.radians(25)):
                continue  # a table is horizontal: skip planes tilted away from "up"
            n = n if n @ up_hint > 0 else -n
        inl = np.abs((pts - a) @ n) < eps
        if inl.sum() > best[0]:
            best = (inl.sum(), n, a)
    return best


# The table is the LOWEST horizontal plane: a flat, textured dish top (frosting, pizza) can win
# the first search, so while much geometry remains below the plane, search again underneath.
cands = sample
for attempt in range(0 if target is not None and up_hint is not None else 4):
    _, n, p0 = ransac(cands)
    below = cands[(cands - p0) @ n < -6 * eps]
    print(f"plane candidate {attempt}: {len(below) / len(cands):.0%} of the points below it")
    if up_hint is None or len(below) < 0.15 * len(cands) or len(below) < 500:
        break
    cands = below
if target is not None and up_hint is not None:
    # With the capture geometry the table is easy to find: in the ring around the dish it is the
    # densest height level along "up". If the table was not reconstructed (plain or dark surface),
    # the base of the dish itself is the reference.
    h = (V - target) @ up_hint
    r = np.linalg.norm((V - target) - np.outer(h, up_hint), axis=1)
    footprint = np.percentile(r, 98)
    ring = (r > footprint * 1.08) & (r < 0.9 * reach) & (np.abs(h) < 0.4 * reach)
    if ring.sum() > 0.02 * len(V):
        hist, edges = np.histogram(h[ring], bins=max(10, int(0.8 * reach / eps)), range=(-0.4 * reach, 0.4 * reach))
        level = edges[np.argmax(hist)] + (edges[1] - edges[0]) / 2
        P = V[ring & (np.abs(h - level) < 2 * eps)]
        centroid = P.mean(0)
        n = np.linalg.svd(P - centroid)[2][-1]
        print(f"table found around the dish at {level / reach:+.3f} x reach ({len(P)} points)")
    else:
        level = np.percentile(h, 0.5)
        centroid, n = target + up_hint * level, up_hint.copy()
        print(f"no table in the reconstruction: using the base of the dish ({level / reach:+.3f} x reach)")
    inl = np.abs((V - centroid) @ n) < 2 * eps
else:
    inl = near & (np.abs((V - p0) @ n) < eps)
    P = V[inl]
    centroid = P.mean(0)
    n = np.linalg.svd(P - centroid)[2][-1]
d = (V - centroid) @ n
if up_hint is not None:
    flip = n @ up_hint < 0
else:  # fallback: more geometry above the table than below it
    flip = np.sum(d > 3 * eps) < np.sum(d < -3 * eps)
if flip:
    n, d = -n, -d
print(f"table plane: {inl.sum()} inliers, eps={eps:.5f}, angle to up: "
      f"{np.degrees(np.arccos(min(1, abs(n @ up_hint)))) if up_hint is not None else float('nan'):.1f} deg")

# rotation taking n -> +Z
z = np.array([0.0, 0.0, 1.0])
v = np.cross(n, z)
s, cth = np.linalg.norm(v), float(n @ z)
if s < 1e-9:
    R = np.eye(3) if cth > 0 else np.diag([1, -1, -1.0])
else:
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    R = np.eye(3) + vx + vx @ vx * ((1 - cth) / s**2)
A = (V - centroid) @ R.T  # aligned: table at z=0

# --- dish footprint: points clearly above the table, around their median ---
axis_xy = ((target - centroid) @ R.T)[:2] if target is not None else np.median(A[:, :2], axis=0)
near_axis = np.linalg.norm(A[:, :2] - axis_xy, axis=1) < (0.5 * reach if reach else np.inf)
high = (A[:, 2] > 6 * eps) & near_axis
cxy = np.median(A[high, :2], axis=0)
r_high = np.linalg.norm(A[high, :2] - cxy, axis=1)
radius = np.percentile(r_high, 97) * 1.12
keep = (A[:, 2] > 1.5 * eps) & (np.linalg.norm(A[:, :2] - cxy, axis=1) < radius)

bm = bmesh.new()
bm.from_mesh(me)
bm.verts.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[bm.verts[i] for i in np.where(~keep)[0]], context="VERTS")

# --- largest connected component ---
bm.verts.ensure_lookup_table()
seen, best_island = set(), []
for v0 in bm.verts:
    if v0.index in seen:
        continue
    stack, island = [v0], []
    seen.add(v0.index)
    while stack:
        v1 = stack.pop()
        island.append(v1)
        for e in v1.link_edges:
            o = e.other_vert(v1)
            if o.index not in seen:
                seen.add(o.index)
                stack.append(o)
    if len(island) > len(best_island):
        best_island = island
keep_set = {v.index for v in best_island}
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in keep_set], context="VERTS")
bmesh.ops.holes_fill(bm, edges=bm.edges[:], sides=64)
bm.to_mesh(me)
bm.free()

faces = len(me.polygons)
if faces > target_tris:
    mod = obj.modifiers.new("decimate", "DECIMATE")
    mod.ratio = target_tris / faces
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
# OpenMVS only loads triangle meshes (hole filling can create n-gons), and it skips faces
# whose normal points away from the camera, so make every face point outwards consistently
bm = bmesh.new()
bm.from_mesh(me)
bmesh.ops.triangulate(bm, faces=bm.faces[:])
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
bm.to_mesh(me)
bm.free()
print(f"output: {len(me.vertices)} verts, {len(me.polygons)} faces (target {target_tris})")

bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
bpy.ops.wm.ply_export(filepath=dst, export_selected_objects=True, export_normals=False, export_uv=False,
                      export_colors="NONE", apply_modifiers=True, ascii_format=False)
json.dump({"R": R.tolist(), "centroid": centroid.tolist(), "cxy": cxy.tolist(), "eps": eps}, open(tf_path, "w"))
print("CLEANED ->", dst)
