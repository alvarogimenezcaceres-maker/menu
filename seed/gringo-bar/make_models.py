"""3D models for Gringo Bar (real size in meters) + poster render.

Neither is a photogrammetry scan: the burger is shaped and textured from the single
real photo, the pizza is procedural. They keep the 3D/AR flow working until the dishes
go through workers/3d/pipeline.py.

  blender -b -P seed/gringo-bar/make_models.py        (from repo root, Blender 4.5)

Outputs:
  models/burguer-de-la-casa-3d.glb     house burger from gringodatos/burguerdelacasa.jpg (silhouette + photo texture)
  models/pizza-gringo-demo.glb         pizza 30 cm: mozzarella, smoked sausage, jalapeños, olives
  images/pizza-gringo-demo.png         transparent poster of the pizza (placeholder dish photo)
"""
import math
import pathlib
import random

import bpy
import bmesh

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
random.seed(7)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, rgb, rough=0.6, sss=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = rough
    return m


def srgb(h):
    """#rrggbb → linear rgb tuple."""
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def assign(obj, m):
    obj.data.materials.clear()
    obj.data.materials.append(m)


def shade(obj, smooth=True):
    for p in obj.data.polygons:
        p.use_smooth = smooth


def cyl(name, r, h, z, m, verts=48, bevel=0.0, jitter=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=(0, 0, z + h / 2))
    o = bpy.context.object
    o.name = name
    if jitter:
        for v in o.data.vertices:
            k = 1 + random.uniform(-jitter, jitter)
            v.co.x *= k
            v.co.y *= k
    if bevel:
        mod = o.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 3
    assign(o, m)
    shade(o)
    return o


def dome(name, r, h, z, m, flat_bottom=True):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=r, location=(0, 0, z))
    o = bpy.context.object
    o.name = name
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-5], context="VERTS")
    bmesh.ops.holes_fill(bm, edges=bm.edges[:], sides=0)
    bm.to_mesh(o.data)
    bm.free()
    o.scale.z = h / r
    assign(o, m)
    shade(o)
    return o


def export(path, objs, image_format="AUTO"):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                              export_apply=True, export_yup=True, export_image_format=image_format, export_draco_mesh_compression_enable=False)
    print("✓", path.name, f"{path.stat().st_size / 1024:.0f} KB")


def burger():
    """Burger modeled from the real photo (gringodatos/burguerdelacasa.jpg).

    The right edge of the burger in the photo gives the silhouette (the left one is
    hidden by the hand); revolving it around a slightly leaning axis gives the shape,
    and the photo is projected from the front as the texture. From the front it looks
    exactly like the photo; the back repeats the front.
    """
    import numpy as np

    reset()
    photo = bpy.data.images.load(str(ROOT / "gringodatos" / "burguerdelacasa.jpg"))
    W, H = photo.size
    px = np.array(photo.pixels[:], dtype=np.float32).reshape(H, W, 4)[::-1, :, :3]  # top-down rows
    mx, mn = px.max(axis=2), px.min(axis=2)
    burger_px = (mx > 0.2) & ((mx - mn) / np.maximum(mx, 1e-6) > 0.3)  # bright + saturated: not background, not paper

    Y0, Y1, STEP = 380, 1122, 3

    def edge(y, x, step):
        miss, last = 0, x
        while 0 < x < W - 1 and miss <= 10:
            if burger_px[y, x]:
                last, miss = x, 0
            else:
                miss += 1
            x += step
        return last

    def smooth(v, n):
        return np.convolve(np.pad(v, n // 2, mode="edge"), np.ones(n) / n, mode="valid")[: len(v)]

    # between these rows the hand hides the left edge: the axis is interpolated there
    HAND = (790, 1060)
    rows = np.arange(Y0, Y1 + 1, STEP)
    right = np.array([edge(y, 560, 1) for y in rows], dtype=float)
    left = np.array([edge(y, 560, -1) for y in rows], dtype=float)
    ok = (rows < HAND[0]) | (rows > HAND[1])
    centers = smooth(np.interp(rows, rows[ok], ((left + right) / 2)[ok]), 15)
    radii = right - centers
    radii = smooth(np.array([np.median(radii[max(0, i - 3):i + 4]) for i in range(len(radii))]), 7)  # drop speckles
    radii *= 0.97  # stay inside the edge so the texture never picks up background

    def axis(y):
        return float(np.interp(y, rows, centers))

    SCALE = 0.06 / radii.max()  # 12 cm wide at the widest point
    SEG = 72
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    ring_verts = []
    for y, r in zip(rows, radii):
        c = axis(y)
        z = (Y1 - y) * SCALE
        ring = []
        for k in range(SEG):
            t = 2 * math.pi * k / SEG
            # texture wraps linearly with the angle (front half = whole photo width), so turning
            # the model shows different parts of the photo instead of a smeared centre column
            u = 1 - 2 * math.acos(math.cos(t)) / math.pi
            ring.append((bm.verts.new(((c - 560) * SCALE + r * SCALE * math.cos(t), r * SCALE * math.sin(t), z)), c + r * u, y))
        ring_verts.append(ring)
    top = (bm.verts.new(((axis(Y0) - 560) * SCALE, 0, (Y1 - Y0 + 9) * SCALE)), axis(Y0), Y0 + 4)
    bottom = (bm.verts.new(((axis(Y1) - 560) * SCALE, 0, 0)), axis(Y1), Y1)

    # top of the bun per photo column: rows above it are background, never sample them
    top_edge = np.full(W, Y0, dtype=float)
    for x in range(W):
        hit = np.nonzero(burger_px[340:700, x])[0]
        if hit.size:
            top_edge[x] = 340 + hit[0]

    def face(vs):
        f = bm.faces.new([v[0] for v in vs])
        for loop, v in zip(f.loops, vs):
            x = min(max(v[1], 0), W - 1)
            loop[uv].uv = (x / W, 1 - max(v[2], top_edge[int(x)] + 8) / H)

    for a, b in zip(ring_verts, ring_verts[1:]):
        for k in range(SEG):
            face([a[k], a[(k + 1) % SEG], b[(k + 1) % SEG], b[k]])
    for k in range(SEG):
        face([top, ring_verts[0][(k + 1) % SEG], ring_verts[0][k]])
        face([bottom, ring_verts[-1][k], ring_verts[-1][(k + 1) % SEG]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new("burguer-de-la-casa")
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new("burguer-de-la-casa", me)
    bpy.context.scene.collection.objects.link(obj)
    shade(obj)

    m = bpy.data.materials.new("foto")
    m.use_nodes = True
    nt = m.node_tree
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = photo
    bsdf = nt.nodes["Principled BSDF"]
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.55
    assign(obj, m)
    bpy.context.view_layer.objects.active = obj
    export(HERE / "models" / "burguer-de-la-casa-3d.glb", [obj], image_format="JPEG")


def pizza():
    reset()
    crust = mat("borde", srgb("#B06A2A"), 0.8)
    sauce = mat("salsa", srgb("#A8301C"), 0.5)
    cheese = mat("mozzarella", srgb("#E3B865"), 0.55)
    sausage = mat("salchicha ahumada", srgb("#8E3B22"), 0.5)
    jalapeno = mat("jalapeño", srgb("#3F7A25"), 0.4)
    olive = mat("aceituna", srgb("#1E1A18"), 0.3)
    board = mat("tabla", srgb("#6B4428"), 0.7)

    R = 0.15
    objs = [cyl("tabla", R * 1.12, 0.012, 0, board, verts=64, bevel=0.003)]
    bpy.ops.mesh.primitive_torus_add(major_radius=R * 0.94, minor_radius=0.012, location=(0, 0, 0.022))
    t = bpy.context.object
    assign(t, crust)
    shade(t)
    objs.append(t)
    objs.append(cyl("masa", R * 0.95, 0.008, 0.012, crust, verts=64))
    objs.append(cyl("salsa", R * 0.9, 0.002, 0.020, sauce, verts=64, jitter=0.02))
    objs.append(cyl("mozzarella", R * 0.86, 0.003, 0.021, cheese, verts=64, jitter=0.04))

    def scatter(n, rmax, build):
        placed = []
        while len(placed) < n:
            a, r = random.uniform(0, 2 * math.pi), R * rmax * math.sqrt(random.random())
            p = (r * math.cos(a), r * math.sin(a))
            if all(math.dist(p, q) > 0.03 for q in placed):
                placed.append(p)
                objs.append(build(*p))

    def sausage_slice(x, y):
        o = cyl("salchicha", 0.013, 0.003, 0.024, sausage, verts=20, bevel=0.001)
        o.location.x, o.location.y = x, y
        return o

    def jalapeno_ring(x, y):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.009, minor_radius=0.0025, location=(x, y, 0.026))
        o = bpy.context.object
        o.scale.z = 0.5
        assign(o, jalapeno)
        shade(o)
        return o

    def olive_half(x, y):
        o = dome("aceituna", 0.007, 0.005, 0.024, olive)
        o.location.x, o.location.y = x, y
        return o

    scatter(14, 0.8, sausage_slice)
    scatter(12, 0.8, jalapeno_ring)
    scatter(8, 0.8, olive_half)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.convert(target="MESH")
    bpy.ops.object.join()
    bpy.context.object.name = "pizza-gringo"
    export(HERE / "models" / "pizza-gringo-demo.glb", [bpy.context.object])
    poster(HERE / "images" / "pizza-gringo-demo.png", R)


def poster(path, R):
    scn = bpy.context.scene
    scn.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items.keys() else "BLENDER_EEVEE"
    scn.render.film_transparent = True
    scn.render.resolution_x = scn.render.resolution_y = 1200
    scn.view_settings.view_transform = "AgX"
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.25
    scn.world = world
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scn.collection.objects.link(cam)
    d = R * 3.9
    cam.location = (0, -d * math.cos(math.radians(50)), d * math.sin(math.radians(50)))
    cam.rotation_euler = (math.radians(40), 0, 0)
    cam.data.lens = 50
    scn.camera = cam
    for loc, e in (((0.4, -0.5, 0.8), 6), ((-0.6, 0.2, 0.5), 2.5)):
        l = bpy.data.objects.new("l", bpy.data.lights.new("l", "AREA"))
        l.data.energy = e * 3
        l.data.size = 0.6
        l.location = loc
        scn.collection.objects.link(l)
        tr = l.constraints.new("TRACK_TO")
        tr.target = scn.objects[0]
    scn.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    print("✓", path.name)


(HERE / "models").mkdir(exist_ok=True)
(HERE / "images").mkdir(exist_ok=True)
burger()
pizza()
