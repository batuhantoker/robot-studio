/** Visual geometry of a compiled model: primitives and MuJoCo-processed mesh buffers. */
import type { Quat } from '../../core/math/linear/transform';
import type { Vec3 } from '../../core/math/linear/vec';
import { GEOM, OBJ, arrays } from '../runtime/arrays';
import type { ModelHandle } from '../model/handle';

export interface GeomInfo {
  id: number;
  name: string;
  body: number;
  type: number;
  size: Vec3;
  pos: Vec3;
  quat: Quat;
  rgba: [number, number, number, number];
  mesh: number;
  group: number;
}

export interface MeshBuffers {
  /** Vertices in the mesh frame MuJoCo recentred them to (geom pos/quat compensate). */
  vertices: Float32Array;
  faces: Uint32Array;
}

export function readGeoms(h: ModelHandle): GeomInfo[] {
  const m = arrays(h.model);
  return Array.from({ length: m.ngeom }, (_, id) => {
    const mat = m.geom_matid[id];
    const rgbaSource = mat >= 0 ? m.mat_rgba : m.geom_rgba;
    const k = mat >= 0 ? mat : id;
    return {
      id,
      name: h.name(OBJ.geom, id),
      body: m.geom_bodyid[id],
      type: m.geom_type[id],
      size: [m.geom_size[3 * id], m.geom_size[3 * id + 1], m.geom_size[3 * id + 2]],
      pos: [m.geom_pos[3 * id], m.geom_pos[3 * id + 1], m.geom_pos[3 * id + 2]],
      quat: [m.geom_quat[4 * id], m.geom_quat[4 * id + 1], m.geom_quat[4 * id + 2], m.geom_quat[4 * id + 3]],
      rgba: [rgbaSource[4 * k], rgbaSource[4 * k + 1], rgbaSource[4 * k + 2], rgbaSource[4 * k + 3]],
      mesh: m.geom_type[id] === GEOM.mesh ? m.geom_dataid[id] : -1,
      group: m.geom_group[id],
    };
  });
}

export function readMesh(h: ModelHandle, id: number): MeshBuffers {
  const m = arrays(h.model);
  const v0 = m.mesh_vertadr[id], nv = m.mesh_vertnum[id];
  const f0 = m.mesh_faceadr[id], nf = m.mesh_facenum[id];
  return {
    vertices: Float32Array.from({ length: nv * 3 }, (_, i) => m.mesh_vert[v0 * 3 + i]),
    faces: Uint32Array.from({ length: nf * 3 }, (_, i) => m.mesh_face[f0 * 3 + i]),
  };
}
