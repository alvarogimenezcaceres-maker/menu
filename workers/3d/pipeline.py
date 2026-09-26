"""Photos -> optimized GLB (docs/04-photogrammetry-pipeline.md), CPU-only version for a laptop.

python workers/3d/pipeline.py <work_dir> --diameter-cm 22.5 [--tris 40000] [--quality fast|standard]

<work_dir>/images/*.jpg must exist. Each stage is skipped when its output already exists,
so a failed run resumes where it stopped. Tool locations come from env vars or defaults:
  COLMAP_EXE, OPENMVS_DIR, BLENDER_EXE  (Windows defaults: .local/tools; elsewhere: PATH)
"""
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
WINDOWS = os.name == "nt"
EXE = ".exe" if WINDOWS else ""
COLMAP = os.environ.get("COLMAP_EXE", str(ROOT / ".local/tools/colmap/bin/colmap.exe") if WINDOWS else "colmap")
OPENMVS = Path(os.environ.get("OPENMVS_DIR", str(ROOT / ".local/tools/openmvs/vc17/x64/Release") if WINDOWS else "/usr/local/bin/OpenMVS"))
BLENDER = os.environ.get("BLENDER_EXE", r"C:\Program Files\Blender Foundation\Blender 4.5\blender.exe" if WINDOWS else "blender")


def arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


work = Path(sys.argv[1]).resolve()
diameter = arg("--diameter-cm", "27")
tris = arg("--tris", "40000")
quality = arg("--quality", "fast")
level = "2" if quality == "fast" else "1"
report_path = work / "report.json"
report = json.loads(report_path.read_text()) if report_path.exists() else {"stages": {}}


def stage(name, output, cmd, cwd=None):
    out = work / output
    if out.exists():
        print(f"· {name}: ya hecho ({output})")
        return
    print(f"▶ {name} …", flush=True)
    t0 = time.time()
    log = work / "logs" / f"{name}.log"
    log.parent.mkdir(exist_ok=True)
    with open(log, "w", encoding="utf-8", errors="replace") as fh:
        rc = subprocess.run(cmd, cwd=cwd or work, stdout=fh, stderr=subprocess.STDOUT).returncode
    dt = round(time.time() - t0, 1)
    report["stages"][name] = {"seconds": dt, "exit": rc}
    report_path.write_text(json.dumps(report, indent=2))
    if rc != 0 or not out.exists():
        # OpenMVS writes to its own <Tool>-<date>.log files, not to stdout
        own = sorted(work.glob(f"{Path(cmd[0]).stem}-*.log"), key=os.path.getmtime)
        src = own[-1] if own else log
        tail = [l for l in src.read_text(encoding="utf-8", errors="replace").splitlines() if "error" in l.lower()][-10:] or             src.read_text(encoding="utf-8", errors="replace").splitlines()[-15:]
        log = src
        sys.exit(f"✗ {name} falló (código {rc}). Últimas líneas de {log}:\n" + "\n".join(tail))
    print(f"  ✓ {name} en {dt:.0f} s")


def mvs(tool, *args):
    return [str(OPENMVS / f"{tool}{EXE}"), "-w", str(work), "--max-threads", "0", "-v", "2", *args]


def blender(script, *args):
    # Blender resolves relative paths against the .blend location, so pass absolute ones
    abs_args = [str(work / a) if a and not a.startswith("-") and not a.replace(".", "").replace(",", "").replace("-", "").isdigit() else a
                for a in args]
    return [BLENDER, "-b", "--factory-startup", "-P", str(HERE / script), "--", *abs_args]


def capture_geometry():
    """From COLMAP poses: the point all cameras look at (the dish), the 'up' direction
    (dish -> mean camera centre) and the mean camera distance. Pure Python, no numpy."""
    lines = [l for l in (work / "sparse_txt/images.txt").read_text().splitlines() if l and not l.startswith("#")]
    cams, dirs = [], []
    for l in lines[::2]:
        qw, qx, qy, qz, tx, ty, tz = map(float, l.split()[1:8])
        R = [[1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw)],
             [2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw)],
             [2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy)]]
        t = (tx, ty, tz)
        cams.append([-sum(R[j][i] * t[j] for j in range(3)) for i in range(3)])  # C = -R^T t
        dirs.append(R[2])  # viewing direction in world = third row of R
    # least squares point closest to all viewing rays: sum(I - vv^T) P = sum(I - vv^T) C
    A = [[0.0] * 3 for _ in range(3)]
    bvec = [0.0] * 3
    for c, v in zip(cams, dirs):
        for i in range(3):
            for j in range(3):
                m = (1.0 if i == j else 0.0) - v[i] * v[j]
                A[i][j] += m
                bvec[i] += m * c[j]
    det = lambda M: (M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0])
                     + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]))
    D0 = det(A)
    P = []
    for k in range(3):
        Mk = [row[:] for row in A]
        for i in range(3):
            Mk[i][k] = bvec[i]
        P.append(det(Mk) / D0)
    mean_c = [sum(c[i] for c in cams) / len(cams) for i in range(3)]
    up = [mean_c[i] - P[i] for i in range(3)]
    norm = sum(x * x for x in up) ** 0.5
    up = [x / norm for x in up]
    reach = sum(sum((c[i] - P[i]) ** 2 for i in range(3)) ** 0.5 for c in cams) / len(cams)
    fmt = lambda v: ",".join(f"{x:.6f}" for x in v)
    return ["--target", fmt(P), "--up", fmt(up), "--reach", f"{reach:.6f}"]


def colmap_gpu_section():
    """COLMAP 3.x names the CPU/GPU switches SiftExtraction/SiftMatching, 4.x FeatureExtraction/FeatureMatching."""
    help_text = subprocess.run([COLMAP, "feature_extractor", "-h"], capture_output=True, text=True, errors="replace").stdout
    return ("FeatureExtraction", "FeatureMatching") if "FeatureExtraction.use_gpu" in help_text else ("SiftExtraction", "SiftMatching")


EXTRACT, MATCH = colmap_gpu_section()
t_all = time.time()
n_img = len(list((work / "images").glob("*.jpg")))
print(f"Fotos: {n_img} · calidad: {quality} · diámetro real: {diameter} cm")

# 1. Structure-from-Motion (COLMAP, CPU)
stage("1a-caracteristicas", "database.db", [COLMAP, "feature_extractor", "--database_path", "database.db",
      "--image_path", "images", "--ImageReader.single_camera", "1", "--ImageReader.camera_model", "OPENCV",
      f"--{EXTRACT}.use_gpu", "0"])
stage("1b-emparejado", "logs/match.done", [sys.executable, "-c",
      f"import subprocess,sys,pathlib;r=subprocess.run([r'{COLMAP}','exhaustive_matcher','--database_path','database.db','--{MATCH}.use_gpu','0']).returncode;"
      "pathlib.Path('logs/match.done').write_text('ok') if r==0 else None;sys.exit(r)"])
(work / "sparse").mkdir(exist_ok=True)
stage("1c-mapeo", "sparse/0/cameras.bin", [COLMAP, "mapper", "--database_path", "database.db",
      "--image_path", "images", "--output_path", "sparse"])
stage("1d-sin-distorsion", "dense/images", [COLMAP, "image_undistorter", "--image_path", "images",
      "--input_path", "sparse/0", "--output_path", "dense", "--output_type", "COLMAP", "--max_image_size", "1600"])

(work / "sparse_txt").mkdir(exist_ok=True)
stage("1e-exportar-camaras", "sparse_txt/images.txt", [COLMAP, "model_converter", "--input_path", "sparse/0",
      "--output_path", "sparse_txt", "--output_type", "TXT"])

# 2. Dense reconstruction and mesh (OpenMVS, CPU)
stage("2a-importar", "scene.mvs", mvs("InterfaceCOLMAP", "-i", "dense", "-o", "scene.mvs", "--image-folder", str(work / "dense/images")))
stage("2b-nube-densa", "scene_dense.ply", mvs("DensifyPointCloud", "scene.mvs", "--resolution-level", level))
stage("2c-malla", "scene_dense_mesh.ply", mvs("ReconstructMesh", "scene_dense.mvs", "-p", "scene_dense.ply"))

# 3. Clean-up: remove the table, keep the dish, decimate (Blender)
stage("3-limpieza", "mesh_clean.ply", blender("clean_mesh.py", "scene_dense_mesh.ply", "mesh_clean.ply", "transform.json",
      "--tris", tris, *capture_geometry()))

# 4. Texture the final low-poly mesh straight from the photos (OpenMVS)
# scene.mvs keeps the full-resolution cameras (scene_dense.mvs stores the downscaled ones used for
# densifying). Seam leveling is off: in OpenMVS 2.4 for Windows it blacks out most texels.
stage("4-textura", "textured.obj", mvs("TextureMesh", "scene.mvs", "-m", "mesh_clean.ply", "-o", "textured.mvs",
      "--export-type", "obj", "--max-texture-size", "4096", "--global-seam-leveling", "0", "--local-seam-leveling", "0"))

# 5. Real size, orientation, GLB + USDZ + poster (Blender)
stage("5-final", "out/model.glb", blender("finalize.py", "textured.obj", "transform.json", "out", "--diameter-cm", diameter))

# 6. Web optimization (glTF-Transform) + 7. validation (Khronos)
node = shutil.which("node") or "node"
stage("6-optimizar", "out/model-web.glb", [node, str(HERE / "optimize.mjs"), "out/model.glb", "out/model-web.glb"])
stage("7-validar", "out/validation.json", [node, str(HERE / "validate.mjs"), "out/model-web.glb", "out/validation.json"])

report["total_seconds"] = round(time.time() - t_all, 1)
report["glb_bytes"] = (work / "out/model-web.glb").stat().st_size
report_path.write_text(json.dumps(report, indent=2))
print(f"\nListo: {work / 'out/model-web.glb'}  ({report['glb_bytes'] / 1048576:.1f} MB) en {report['total_seconds'] / 60:.1f} min")
