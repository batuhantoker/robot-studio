"""Converts robot meshes to files MuJoCo reads: binary STL, or OBJ when STL's face cap would truncate.

usage: meshes.py jobs.json   (jobs: [{"src", "dest", "hull"?, "decimate"?, "upAxis"?}], dest without extension)
Collada <unit> is applied so output is in metres; <up_axis> only with "upAxis", since ROS tools ignore it and
models are authored that way. "hull" writes the convex hull, which is
all MuJoCo collides with, so collision meshes stay small enough for its 4 GB WASM heap.
"""
import json
import sys
import xml.etree.ElementTree as ET

import numpy as np
import trimesh

# MuJoCo silently keeps only the first 199999 faces of an STL.
STL_MAX_FACES = 199_999
UP_TO_Z = {
    "Z_UP": np.eye(3),
    "Y_UP": np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], float),
    "X_UP": np.array([[0, 0, -1], [0, 1, 0], [1, 0, 0]], float),
}


def collada_frame(src):
    scale, up = 1.0, "Y_UP"
    for _, el in ET.iterparse(src, events=("end",)):
        tag = el.tag.rsplit("}", 1)[-1]
        if tag == "unit" and el.get("meter"):
            scale = float(el.get("meter"))
        elif tag == "up_axis" and el.text:
            up = el.text.strip().upper()
        elif tag == "asset":
            break
    return scale, up if up in UP_TO_Z else "Y_UP"


def collada_raw(src):
    """Geometry without the scene graph, for files whose material bindings make the scene load come up empty."""
    import collada

    doc = collada.Collada(src, ignore=[collada.common.DaeError])
    parts = []
    for geometry in doc.geometries:
        for prim in geometry.primitives:
            prim = prim.triangleset() if hasattr(prim, "triangleset") else prim
            if getattr(prim, "vertex", None) is not None and len(prim.vertex_index):
                parts.append(trimesh.Trimesh(prim.vertex, prim.vertex_index.reshape(-1, 3), process=False))
    return parts


def load(src, up_axis=False):
    ext = src.rsplit(".", 1)[-1].lower()
    scale, up = collada_frame(src) if ext == "dae" else (1.0, "Z_UP")
    scene = trimesh.load(src, force="scene", process=False)
    parts = [g for g in scene.dump() if isinstance(g, trimesh.Trimesh) and len(g.faces)]
    if not parts and ext == "dae":
        parts = collada_raw(src)
    if not parts:
        raise ValueError("no triangles")
    mesh = trimesh.util.concatenate(parts)
    transform = np.eye(4)
    transform[:3, :3] = (UP_TO_Z[up] if up_axis else np.eye(3)) * scale
    mesh.apply_transform(transform)
    return mesh, scale, up


def convert(job):
    mesh, scale, up = load(job["src"], job.get("upAxis", False))
    if job.get("hull"):
        mesh = mesh.convex_hull
    elif job.get("decimate") and len(mesh.faces) > job["decimate"]:
        # Loaded unprocessed, an STL is a soup of separate triangles, and decimating those tears holes in the surface.
        mesh.merge_vertices()
        mesh = mesh.simplify_quadric_decimation(face_count=job["decimate"])
    if len(mesh.faces) <= STL_MAX_FACES:
        out = job["dest"] + ".stl"
        mesh.export(out, file_type="stl")
    else:
        out = job["dest"] + ".obj"
        mesh.merge_vertices()
        text = trimesh.exchange.obj.export_obj(
            mesh, include_normals=False, include_color=False, include_texture=False, write_texture=False
        )
        with open(out, "w") as f:
            f.write("\n".join(l for l in text.splitlines() if not l.startswith(("mtllib", "usemtl"))))
    return {"file": out, "faces": int(len(mesh.faces)), "unit": scale, "up": up}


def main():
    with open(sys.argv[1]) as f:
        jobs = json.load(f)
    results = []
    for job in jobs:
        try:
            results.append({"src": job["src"], **convert(job)})
        except Exception as err:  # one bad mesh must not sink the robot
            results.append({"src": job["src"], "error": f"{type(err).__name__}: {err}"[:300]})
    print(json.dumps(results))


if __name__ == "__main__":
    main()
