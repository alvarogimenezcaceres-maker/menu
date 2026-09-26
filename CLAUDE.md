# Menú 3D: notes for Claude

Read by Claude Code in every client (CLI, desktop app, web). **This repo is public**: never write secrets,
tokens, client pricing or business notes here (those live in `negocio/` and `.local/`, both gitignored).

## Working with the owner

- Reply in **Spanish (Rioplatense voseo)**. Code, comments and commit messages in **English**; user-facing
  docs (`PUBLICAR.md`) in Spanish.
- **Zero cost**: free plans only (Render, Neon, UploadThing 2 GB, Cloudflare Workers, public-repo Actions).
- Don't touch secrets, the Cloudflare token or other Cloudflare projects. Don't break publishing or live menus.
- When the owner pastes a secret they tend to paste the whole `NAME=value` line: tell them to paste only the value.
  Check secrets by behaviour (a signed request that answers 404 "scan not found" means they match), never by printing them.

## Where things run

`PUBLICAR.md` is the operational source of truth (addresses, variables, step-by-step). In short:

| Piece | Code | Runs on | Deploy |
|---|---|---|---|
| Panel (Payload 3.90 + Next) | `apps/web` | Render (image `ghcr.io/…/menu3d-panel`) | push → `panel-image.yml` builds → owner does Render **Manual Deploy → Deploy latest reference** |
| Database | `apps/web/src/migrations` | Neon PostgreSQL | applied when the panel starts on Render (`prodMigrations`) |
| Photos and 3D models | `apps/web` media collection | UploadThing (`utfs.io/f/…`), local `apps/web/media/` without a token | n/a |
| Public menus | `site/` + `seed/<slug>/` | Cloudflare Workers `menu3d-demo` | push touching `site/**` or `seed/**` → `deploy-menus.yml`. **Ask the owner before pushing `site/**`** |
| Photogrammetry | `workers/3d` | GitHub Actions `photogrammetry.yml` (ubuntu-24.04) **and** Windows (the notebook) | same `pipeline.py` on both |

Publishing («Publicar ahora») copies each GLB and photo into `seed/<slug>/` in git, so live menus never
depend on UploadThing: deleting a Media doc doesn't break a published menu until the next publish.

## Desktop (notebook) and cloud must stay aligned

Both run the **same code**; only the tools' location changes:

- `workers/3d/pipeline.py` finds COLMAP/OpenMVS/Blender from `COLMAP_EXE`, `OPENMVS_DIR`, `BLENDER_EXE`,
  defaulting to `.local/tools/…` and Blender 4.5 on Windows and to the PATH on Linux. Any new stage must work
  on both (call Node/Python scripts, not shell-specific commands).
- The panel runs locally with `iniciar-panel.cmd` (port 3100, `.local/pgdata`) and in the cloud on Render,
  from the same `apps/web`.
- When a pipeline setting changes, update **all** of: the code, the "Tamaño y capacidad" block in
  `PUBLICAR.md`, the as-built note in `docs/04-photogrammetry-pipeline.md` and this file.

## 3D model format (decided 2026-09-26, don't change without re-measuring)

Stage 6 is `workers/3d/optimize.mjs` (glTF-Transform 4.5 API, not the CLI):
smooth normals shared by position → `dedup` → `weld` → `prune` → texture **JPEG 2048 px**. **No mesh compression.**

- Why smooth normals: the Blender export is flat-shaded (OpenMVS OBJ has no normals), so each triangle owned
  3 vertices (~120k for 40k tris) and the mesh, not the texture, was ~4.3 MB. Welding after smoothing leaves
  ~28k vertices. It looks the same because lighting is baked into the photo texture.
- Why 2048 JPEG and no Draco/meshopt/WebP: Android Scene Viewer's docs only list `KHR_materials_unlit` and
  `KHR_texture_transform`, so the GLB requires **no extensions**. 1024 px looked blurry on phones.
- Result on the torta test: **1.37 MB** (was 4.5 MB), 39,999 triangles, 0 validator errors/warnings,
  ~15 min per Actions run. With the poster, ~2 MB per scanned dish → ~140 restaurants × 6 3D dishes in 2 GB.
- Measured alternative: WebP 2048 + Draco = 0.34 MB, but it needs the Draco decoder self-hosted next to
  `model-viewer.min.js` (no third-party CDNs; the files are in `site/node_modules/three/examples/jsm/libs/draco/gltf/`)
  and a check on a real Android that Scene Viewer opens it. Only switch after that check.
- Models scanned before 2026-09-26 are still 4.5 MB and require `EXT_texture_webp`; they improve when re-scanned.
- Stage 7 (`validate.mjs`, Khronos validator) must stay at 0 errors.
- Test data: `.local/fotogrametria/torta/` (photos in `images/`, Blender output `out/model.glb`). To iterate on
  stage 6 alone: `node workers/3d/optimize.mjs <in.glb> <out.glb>` then `node workers/3d/validate.mjs <out.glb> <report.json>`.
- End-to-end test in the cloud: `PUBLICAR.md` → «Probar sin el panel» (temporary `test-data-torta` release; delete it after).

## Panel behaviour worth knowing

- `apps/web/src/scans/endpoints.ts` `workerFinishEndpoint`: attaches the new GLB, then deletes the previous
  model Media doc (and its UploadThing file) unless another dish, category or restaurant references it
  (`src/scans/media-cleanup.ts`, fields read from the Payload config). The poster replaces the dish photo only
  if there was none or it was an earlier scan's poster (filename `<slug>-3d-<scanId>.png`); uploaded photos stay.
- Scan photos are deleted after every scan, success or failure (2 GB limit).
- Tests: `cd apps/web && npx vitest run tests/int/` · types: `npx tsc --noEmit`.
