# SPDX-License-Identifier: GPL-3.0-or-later  (imports bpy)
"""Stage 5 (docs/04 §13.2): textured mesh -> real-size GLB + USDZ + poster.

blender -b -P finalize.py -- <textured.obj> <transform.json> <out_dir> --diameter-cm 22.5

- applies the table alignment, puts the origin at the bottom centre
- scales so the widest horizontal extent equals the real dish size (AR places it in metres)
- exports model.glb, model.usdz and poster.png (transparent background)
"""
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:]
src, tf_path, out_dir = argv[0], argv[1], os.path.abspath(argv[2])  # Blender resolves relative render paths against "//"
diameter_m = float(argv[argv.index("--diameter-cm") + 1]) / 100 if "--diameter-cm" in argv else 0.27
os.makedirs(out_dir, exist_ok=True)
tf = json.load(open(tf_path))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=src, forward_axis="Y", up_axis="Z")
obj = bpy.context.selected_objects[0]
bpy.context.view_layer.objects.active = obj

R = Matrix(tf["R"]).to_4x4()
T = Matrix.Translation(-Vector(tf["centroid"]))
obj.data.transform(R @ T)  # table plane -> z = 0

xs = [v.co.x for v in obj.data.vertices]
ys = [v.co.y for v in obj.data.vertices]
zs = [v.co.z for v in obj.data.vertices]
extent = max(max(xs) - min(xs), max(ys) - min(ys))
scale = diameter_m / extent
center = Vector(((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, min(zs)))
obj.data.transform(Matrix.Scale(scale, 4) @ Matrix.Translation(-center))
obj.name = "plato"
height_m = (max(zs) - min(zs)) * scale

for m in obj.data.materials:
    if m and m.use_nodes:
        bsdf = m.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Roughness"].default_value = 0.7
            bsdf.inputs["Metallic"].default_value = 0.0

bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, "model.glb"), export_format="GLB",
                          use_selection=True, export_yup=True, export_apply=True)
try:
    bpy.ops.wm.usd_export(filepath=os.path.join(out_dir, "model.usdz"), selected_objects_only=True)
except Exception as e:  # USDZ is optional: model-viewer can build it on iOS at runtime
    print("USDZ export skipped:", e)

# poster: 3/4 view, transparent background
scene = bpy.context.scene
# POSTER_ENGINE=CYCLES on machines without a GPU/OpenGL (CI runners): EEVEE needs one
for engine in filter(None, (os.environ.get("POSTER_ENGINE"), "BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES")):
    try:
        scene.render.engine = engine
        break
    except TypeError:
        continue
if scene.render.engine == "CYCLES":
    scene.cycles.samples = 64
    scene.cycles.use_denoising = False
scene.render.film_transparent = True
scene.render.resolution_x = scene.render.resolution_y = 1024
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
world = bpy.data.worlds.new("w")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
scene.world = world
bpy.ops.object.light_add(type="AREA", location=(0.3, -0.3, 0.6))
light = bpy.context.active_object
light.data.energy = 40
light.data.size = 0.6
light.rotation_euler = (Vector((0, 0, 0.03)) - light.location).to_track_quat("-Z", "Y").to_euler()
bpy.ops.object.camera_add()
cam = bpy.context.active_object
cam.data.lens = 50
d = diameter_m * 2.6
cam.location = (0, -d * math.cos(math.radians(35)), height_m / 2 + d * math.sin(math.radians(35)))
cam.rotation_euler = (Vector((0, 0, height_m * 0.4)) - cam.location).to_track_quat("-Z", "Y").to_euler()
scene.camera = cam
scene.render.filepath = os.path.join(out_dir, "poster.png")
bpy.ops.render.render(write_still=True)

json.dump({"diameter_m": diameter_m, "height_m": round(height_m, 4), "faces": len(obj.data.polygons)},
          open(os.path.join(out_dir, "finalize.json"), "w"))
print(f"FINAL -> {out_dir}  ({diameter_m*100:.1f} cm x {height_m*100:.1f} cm, {len(obj.data.polygons)} faces)")
