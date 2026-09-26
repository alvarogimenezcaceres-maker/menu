# SPDX-License-Identifier: GPL-3.0-or-later  (imports bpy)
"""DEMO ONLY: simulates a phone capture session by rendering photos around a scanned model.

blender -b -P render_views.py -- <model.gltf> <out_dir> [--size 1600]

Three rings like the capture guide (docs/04 §13.5): low, mid and top-down views,
on a patterned tablecloth so Structure-from-Motion has texture to match.
"""
import math
import os
import random
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
src, out_dir = argv[0], os.path.abspath(argv[1])
width = int(argv[argv.index("--size") + 1]) if "--size" in argv else 1600
os.makedirs(out_dir, exist_ok=True)
random.seed(7)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
corners = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
lo = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
hi = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
center = (lo + hi) / 2
size = max(hi.x - lo.x, hi.y - lo.y)
height = hi.z - lo.z

# patterned tablecloth (procedural: no external textures)
bpy.ops.mesh.primitive_plane_add(size=size * 6, location=(center.x, center.y, lo.z))
cloth = bpy.context.active_object
mat = bpy.data.materials.new("mantel")
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes["Principled BSDF"]
bsdf.inputs["Roughness"].default_value = 0.85
tex_coord = nt.nodes.new("ShaderNodeTexCoord")
voronoi = nt.nodes.new("ShaderNodeTexVoronoi")
voronoi.inputs["Scale"].default_value = 60.0
noise = nt.nodes.new("ShaderNodeTexNoise")
noise.inputs["Scale"].default_value = 140.0
noise.inputs["Detail"].default_value = 8.0
mix = nt.nodes.new("ShaderNodeMix")
mix.data_type = "RGBA"
mix.inputs["Factor"].default_value = 0.45
ramp = nt.nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].color = (0.05, 0.03, 0.02, 1)
ramp.color_ramp.elements[1].color = (0.55, 0.42, 0.28, 1)
nt.links.new(tex_coord.outputs["Object"], voronoi.inputs["Vector"])
nt.links.new(tex_coord.outputs["Object"], noise.inputs["Vector"])
nt.links.new(voronoi.outputs["Color"], mix.inputs["A"])
nt.links.new(noise.outputs["Color"], mix.inputs["B"])
nt.links.new(mix.outputs["Result"], ramp.inputs["Fac"])
nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
cloth.data.materials.append(mat)

# soft, even light (overcast window + two softboxes)
world = bpy.data.worlds.new("mundo")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.9, 0.9, 0.88, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.3
bpy.context.scene.world = world
for i, (ax, ay) in enumerate([(1, 1), (-1, -0.6)]):
    bpy.ops.object.light_add(type="AREA", location=(center.x + ax * size * 2, center.y + ay * size * 2, lo.z + size * 2.5))
    light = bpy.context.active_object
    light.data.energy = 18 * size / 0.2
    light.data.size = size * 3
    light.rotation_euler = (center - light.location).to_track_quat("-Z", "Y").to_euler()

# phone-like camera: 26 mm equivalent
bpy.ops.object.empty_add(location=(center.x, center.y, lo.z + height * 0.35))
target = bpy.context.active_object
bpy.ops.object.camera_add()
cam = bpy.context.active_object
cam.data.lens = 26
cam.data.sensor_width = 36
track = cam.constraints.new("TRACK_TO")
track.target = target
track.track_axis = "TRACK_NEGATIVE_Z"
track.up_axis = "UP_Y"
bpy.context.scene.camera = cam

scene = bpy.context.scene
for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"):
    try:
        scene.render.engine = engine
        break
    except TypeError:
        continue
scene.render.resolution_x = width
scene.render.resolution_y = int(width * 0.75)
scene.render.image_settings.file_format = "JPEG"
scene.render.image_settings.quality = 92

dist = size * 1.45  # dish fills ~60-70% of the frame, as the capture guide asks
rings = [(18, 16), (38, 16), (62, 12)]  # (elevation degrees, photos)
n = 0
for elev, count in rings:
    for k in range(count):
        az = 2 * math.pi * k / count + math.radians(random.uniform(-4, 4)) + math.radians(elev)
        e = math.radians(elev + random.uniform(-2, 2))
        d = dist * random.uniform(0.95, 1.05)
        cam.location = (
            target.location.x + d * math.cos(e) * math.cos(az),
            target.location.y + d * math.cos(e) * math.sin(az),
            target.location.z + d * math.sin(e),
        )
        n += 1
        scene.render.filepath = os.path.join(out_dir, f"{n:04d}.jpg")
        bpy.ops.render.render(write_still=True)
print(f"RENDERED {n} views with {scene.render.engine} -> {out_dir}")
