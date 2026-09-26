# 04 · Photogrammetry Pipeline (Photos → Optimized GLB)

Deliverable **#13**. Everything below is OSS: COLMAP (BSD), OpenMVS (AGPL, unmodified CLI), Blender (GPL, tool), glTF-Transform (MIT), KTX-Software (Apache), glTF-Validator (Apache), TRELLIS.2 (MIT).

---

## 13.1 Flow

```
 Admin (Uppy, presigned multipart)            pg-boss "reconstruct"             models-public/…/v{n}/
 ┌───────────────┐   capture-private/raw  ┌───────────────────────────────┐   ┌─────────────────────┐
 │ 40–120 photos │ ─────────────────────► │ WORKER (GPU)                  │──►│ model.glb  (≤3 MB)  │
 │ + plate cm    │   POST /submit ───────►│                               │   │ model.usdz (iOS)    │
 │ + quality     │                        │ 0 preflight                   │   │ poster.webp         │
 └───────────────┘                        │ 1 COLMAP SfM ─┐               │   └─────────────────────┘
                                          │ 2 OpenMVS     │ fail? ──► AI  │   callback → models_3d.ready
                                          │   densify→mesh│    fallback   │   → dish.active_model_id (if auto)
                                          │ 3 Blender A   │   (TRELLIS.2) │   → revalidateTag(restaurant)
                                          │   clean/crop  │               │
                                          │ 4 OpenMVS     │               │
                                          │   TextureMesh │               │
                                          │ 5 Blender B   │◄──────────────┘
                                          │   scale/orient/export GLB+USDZ│
                                          │ 6 glTF-Transform optimize     │
                                          │ 7 Validate + poster + upload  │
                                          └───────────────────────────────┘
```

**Key trick:** clean and decimate the *untextured* mesh first, then let OpenMVS texture the **final low-poly mesh** directly from the photos. That avoids a lossy high→low bake and gives sharper textures at 20–50k triangles.

---

## 13.2 Stage by stage

| # | Stage | Tool / command (sketch) | Output | Typical time* |
|---|---|---|---|---|
| 0 | **Preflight** | Node + sharp: count ≥ 30, blur score (Laplacian variance), EXIF focal, auto-orient, downscale to ≤ 3200 px long edge, strip GPS | `images/` | 10 s |
| 1a | Features | `colmap feature_extractor --database_path db.db --image_path images --ImageReader.single_camera 1 --ImageReader.camera_model OPENCV --SiftExtraction.use_gpu 1` | db.db | 30–60 s |
| 1b | Matching | `colmap exhaustive_matcher --database_path db.db` (≤150 imgs) or `sequential_matcher` for turntable video frames | matches | 30–90 s |
| 1c | Mapping | `colmap mapper --database_path db.db --image_path images --output_path sparse` (or COLMAP's global mapper, from the merged GLOMAP, for speed) | sparse/0 | 1–3 min |
| 1d | Gravity align | `colmap model_orientation_aligner` → up = +Y | sparse aligned | 5 s |
| 1e | Undistort | `colmap image_undistorter --image_path images --input_path sparse/0 --output_path dense --output_type COLMAP` | dense/ | 20 s |
| 2a | Import | `InterfaceCOLMAP -i dense -o scene.mvs --image-folder dense/images` | scene.mvs | 5 s |
| 2b | Densify | `DensifyPointCloud scene.mvs --resolution-level 1` (2 for "fast") | scene_dense.mvs/.ply | 2–6 min |
| 2c | Mesh | `ReconstructMesh scene_dense.mvs` then `RefineMesh … --resolution-level 1` (skip on "fast") | mesh.ply (~1–3 M tris) | 2–5 min |
| 3 | **Blender A** (headless `blender -b -P clean.py`) | detect table plane (RANSAC on low vertices) → delete everything below it and outside a cylinder around the dish centroid → keep largest connected component → fill small holes → **Decimate** to target tris (fast 20k / standard 40k / high 80k) → export PLY *in the same coordinate frame* | mesh_clean.ply | 30–60 s |
| 4 | Texture | `TextureMesh scene_dense.mvs -m mesh_clean.ply --export-type obj --resolution-level 0 --max-texture-size 4096` | textured.obj + atlas | 1–2 min |
| 5 | **Blender B** (`finalize.py`) | import → origin to bottom-centre → rotate to canonical "front" (camera #1 direction) → **scale to metres** (see 13.3) → bake neutral lighting out (optional delight) → set PBR (roughness 0.6, metallic 0) → export **GLB** (Y-up) + **USDZ** (`bpy.ops.wm.usd_export(filepath='model.usdz')`) | raw.glb, model.usdz | 30 s |
| 6 | Optimise | `gltf-transform optimize raw.glb model.glb --compress meshopt --texture-compress ktx2 --texture-size 2048 --simplify false` (use `webp` instead of `ktx2` if `toktx` absent) then `gltf-transform inspect` | model.glb 0.8–3 MB | 10–30 s |
| 7a | Validate | `gltf_validator model.glb -o` → reject on errors | report.json | 2 s |
| 7b | Poster | headless render via Blender Eevee (or Playwright + model-viewer `toDataURL`) → `poster.webp` 1024², plus 400 px thumb | poster.webp | 10 s |
| 7c | Upload + callback | S3 PUT to `models-public/t/{tenant}/dishes/{dish}/models/{model}/v{n}/`. `POST /internal/jobs/:id/complete` | n/a | 5 s |

\*RTX 4000 Ada-class GPU, 60 × 12 MP photos. **About 10–20 min end-to-end** on "standard".

### Quality presets (stored in `captures.options`)
| Preset | Densify level | Refine | Target tris | Texture | Use |
|---|---|---|---|---|---|
| fast | 2 | no | 20k | 1024 | previews, cheap plans |
| standard | 1 | yes | 40k | 2048 | default |
| high | 0 | yes | 80k | 2048 + normal map | hero dishes (the normal map is baked from the pre-decimation mesh) |

---

## 13.3 Real-world scale (critical for AR)

Photogrammetry output has arbitrary units, but AR places objects in **metres**. Scale is resolved in this order:
1. **Marker (best):** a printable **ChArUco/ArUco mat** (A4, generated by the platform) under the plate. The worker detects it with OpenCV (Apache-2.0) in 3+ images and triangulates two corners with known distance, which gives exact scale.
2. **Plate diameter:** after cropping, take the widest XZ extent of the mesh near the table plane and scale it to `dish.plate_diameter_cm` (entered by staff, default 27 cm).
3. **Manual:** admin preview slider (model-viewer + dimension hotspots) saves `viewer_opts.scale`.

---

## 13.4 AI fallback (TRELLIS.2)

Triggered when:
- SfM registers < 60% of images, or
- the mesh is non-manifold after cleanup, or
- the user picks "AI (1–4 photos)".

Steps: best 1–4 photos → background removal (rembg, MIT) → TRELLIS.2 → GLB → **same stages 5–7** (scale by plate diameter, optimise, validate). About 1–2 min on a 24 GB GPU. The result is labelled `source='ai_generated'` so the restaurant knows it's an interpretation, not a scan.

---

## 13.5 Capture guide (shown in admin, with a 30-second video)

- **Turntable** (a lazy susan works) on a **matte, textured** mat (the ChArUco mat). Keep the phone on a tripod or steady and rotate the plate, or walk around it.
- **Three rings:** 20 photos at ~15°, 20 at ~40°, 10–15 at ~70° (top-down). Overlap ≥ 70%.
- **Soft, diffuse light** (overcast window or two softboxes). No hard shadows, **no flash**.
- **Lock exposure/focus** (tap-and-hold on iOS/Android). Keep the plate fully in frame, filling 60–80% of it.
- Avoid steam, liquids with mirror reflections, glass, and garnishes that move (fan off!).
  - Glossy sauces: a light dusting of matte spray on a *display* plate, or cross-polarised light.
  - Otherwise use the AI fallback.
- **Expected success rate** for auto-reconstruction: ~70–85% for plated solids (burgers, sushi, desserts, pizza slices) and ~20–40% for bowls of soup, drinks and very shiny dishes. Offer AI or manual GLB upload for the rest.

Phase 2: a guided capture PWA page (`/capture/:captureId`) using `DeviceOrientationEvent` to show ring coverage live, plus video upload with frame extraction (`ffmpeg -vf "fps=2"`, LGPL build).

---

## 13.6 Worker implementation

```
workers/3d/
  Dockerfile              # FROM nvidia/cuda:12.x-runtime-ubuntu24.04
                          #   + colmap (official image stage) + openMVS (built stage, pinned tag)
                          #   + blender 4.x LTS (official tarball) + node 22 + @gltf-transform/cli
                          #   + KTX-Software toktx + gltf_validator
  src/
    index.ts              # boss.work('reconstruct', {teamSize:1, teamConcurrency:1}, handle)
    pipeline.ts           # stage runner: execa + timeouts + progress callbacks + tmp dir per job
    stages/{preflight,sfm,mvs,cleanup,texture,finalize,optimize,validate,poster,upload}.ts
    s3.ts  report.ts
  blender/                # GPL-3.0 (imports bpy)
    clean.py  finalize.py  poster.py
  test/fixtures/          # 3 reference captures (burger, sushi, dessert) + golden metrics
```

Operational rules:
- One job per GPU (`teamConcurrency: 1`). Retries: 2, exponential backoff. Per-stage timeouts: SfM 10 min, MVS 30 min, total 60 min.
- Every stage writes `stage`/`progress` via the internal API, which drives the admin progress bar over SSE.
- Artefacts in `capture-private/…/work` let a failed job **resume** from the last good stage.
- GPU seconds are recorded in `processing_jobs.gpu_seconds` and `usage_counters.gen3d` for billing.
- Scale-to-zero: a small `boss.getQueueSize('reconstruct')` watcher can start/stop a rented GPU VM through the provider API (optional).

---

## 13.7 Manual upload path (always available)

Admin uploads a `.glb`, `.gltf` zip or `.usdz` → same stages **6–7** (optimise, validate, poster). If only a GLB is uploaded, **model-viewer auto-generates USDZ** on iOS at runtime. A pre-generated USDZ is still preferred for faster Quick Look launch.
