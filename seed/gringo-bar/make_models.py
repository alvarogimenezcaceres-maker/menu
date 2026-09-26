"""Demo 3D models for Gringo Bar (procedural, real size in meters) + poster renders.

These are NOT scans of the real dishes: they are placeholders so the 3D/AR flow
works until the restaurant's dishes go through workers/3d/pipeline.py.

  blender -b -P seed/gringo-bar/make_models.py        (from repo root, Blender 4.5)

Outputs:
  models/burguer-de-la-casa-demo.glb   double smash burger: brioche, 2 patties, cheddar, milanesa, papas pay
  models/pizza-gringo-demo.glb         pizza 30 cm: mozzarella, smoked sausage, jalapeños, olives
  images/pizza-gringo-demo.png         transparent poster of the pizza (placeholder dish photo)
"""
import math
import pathlib
import random

import bpy
import bmesh

HERE = pathlib.Path(__file__).resolve().parent
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


def drippy_slice(name, size, z, m, drip=0.02):
    """Cheddar slice: thin square rotated 45° with corners drooping."""
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=24, y_subdivisions=24, size=size, location=(0, 0, z))
    o = bpy.context.object
    o.name = name
    o.rotation_euler.z = math.radians(random.uniform(10, 40))
    half = size / 2
    for v in o.data.vertices:
        d = max(abs(v.co.x), abs(v.co.y)) / half
        r = math.hypot(v.co.x, v.co.y)
        if r > half * 0.78:
            v.co.z -= drip * ((r - half * 0.78) / (half * 0.6)) ** 1.5
    sol = o.modifiers.new("solid", "SOLIDIFY")
    sol.thickness = 0.0025
    assign(o, m)
    shade(o)
    return o


def export(path, objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                              export_apply=True, export_yup=True, export_draco_mesh_compression_enable=False)
    print("✓", path.name, f"{path.stat().st_size / 1024:.0f} KB")


def burger():
    reset()
    bun = mat("pan brioche", srgb("#C9731C"), 0.45)
    crumb = mat("miga", srgb("#EFD39A"), 0.8)
    beef = mat("carne", srgb("#4A2A1A"), 0.85)
    cheddar = mat("cheddar", srgb("#FFA000"), 0.35)
    breaded = mat("milanesa", srgb("#C8742A"), 0.9)
    ketchup = mat("ketchup", srgb("#A3120E"), 0.25)
    straw = mat("papas pay", srgb("#E8C46A"), 0.7)
    paper = mat("papel", srgb("#EDEDED"), 0.9)

    R = 0.06  # 12 cm bun
    objs = [cyl("papel", R * 1.25, 0.002, 0, paper, verts=8)]
    objs.append(cyl("pan base", R, 0.022, 0.002, bun, bevel=0.006))
    objs.append(cyl("miga base", R * 0.96, 0.002, 0.024, crumb))
    z = 0.026
    for i in range(2):
        objs.append(cyl(f"medallon {i + 1}", R * 1.02, 0.016, z, beef, jitter=0.05, bevel=0.004))
        z += 0.016
        objs.append(drippy_slice(f"cheddar {i + 1}", R * 1.75, z + 0.001, cheddar))
        z += 0.004
    # papas pay: thin sticks scattered on top of the cheese
    for i in range(70):
        a = random.uniform(0, 2 * math.pi)
        r = random.uniform(0, R * 0.9)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(r * math.cos(a), r * math.sin(a), z + random.uniform(0.001, 0.006)))
        s = bpy.context.object
        s.scale = (0.022, 0.0016, 0.0016)
        s.rotation_euler = (random.uniform(-.3, .3), random.uniform(-.3, .3), random.uniform(0, math.pi))
        assign(s, straw)
        objs.append(s)
    z += 0.006
    objs.append(cyl("milanesa", R * 0.8, 0.011, z, breaded, jitter=0.12, bevel=0.003))
    z += 0.011
    objs.append(cyl("ketchup", R * 0.72, 0.002, z, ketchup, jitter=0.15))
    z += 0.002
    objs.append(cyl("miga tapa", R * 0.96, 0.002, z, crumb))
    objs.append(dome("pan tapa", R, 0.045, z + 0.002, bun))
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.convert(target="MESH")
    bpy.ops.object.join()
    bpy.context.object.name = "burguer-de-la-casa"
    export(HERE / "models" / "burguer-de-la-casa-demo.glb", [bpy.context.object])


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
