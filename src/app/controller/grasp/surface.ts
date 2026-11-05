/** A hand's drawn surface read from its model, so fingers are measured against what the eye sees, not collision proxies. */
import { quatToMat, type Transform } from '../../../core/math/linear/transform';
import type { Mat3 } from '../../../core/math/linear/mat3';
import type { Vec3 } from '../../../core/math/linear/vec';
import type { HandLink, HandSurface } from '../../../core/prosthesis/closure';
import { readGeoms, readMesh, visibleGeom } from '../../../physics/extract/geoms';
import { GEOM, OBJ, arrays } from '../../../physics/runtime/arrays';
import type { RobotSession } from '../../robots/session';

/** Longest triangle edge left undivided: a sparse mesh's large faces would otherwise slide through a small object. */
const EDGE = 0.003;
/** Fingertips are measured to a twentieth of a millimetre on a pin, which a 3 mm grid on a curved pad cannot promise. */
const TIP_EDGE = 0.001;
/** Links further back only ever meet something wide, where the same error needs far fewer samples. */
const FINGER_EDGE = 0.002;

const rotate = (R: Mat3, p: ArrayLike<number>, o: number, t: Vec3, out: number[]) => {
  const x = p[o], y = p[o + 1], z = p[o + 2];
  out.push(R[0] * x + R[1] * y + R[2] * z + t[0], R[3] * x + R[4] * y + R[5] * z + t[1], R[6] * x + R[7] * y + R[8] * z + t[2]);
};

function fill(a: Vec3, b: Vec3, c: Vec3, edge: number, out: number[]): void {
  const ab = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), bc = Math.hypot(b[0] - c[0], b[1] - c[1], b[2] - c[2]), ca = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  const longest = Math.max(ab, bc, ca);
  if (longest <= edge) return;
  const mid = (u: Vec3, v: Vec3): Vec3 => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2, (u[2] + v[2]) / 2];
  const [p, q, r] = longest === ab ? [a, b, c] : longest === bc ? [b, c, a] : [c, a, b];
  const m = mid(p, q);
  out.push(...m);
  fill(p, m, r, edge, out);
  fill(m, q, r, edge, out);
}

/** Some models carry far more mesh than a link's area needs: past this, evenly thinned, a click would stall on the solve. */
const MOST = 40000;

/** Every drawn mesh on a body: its vertices, plus points filling triangles too big to trust vertices alone. */
function samples(s: RobotSession, body: number, edge: number): Float64Array {
  const out: number[] = [];
  for (const g of readGeoms(s.handle)) {
    if (g.body !== body || !visibleGeom(g) || g.type !== GEOM.mesh) continue;
    const R = quatToMat(g.quat), mesh = readMesh(s.handle, g.mesh);
    const local: number[] = [];
    for (let v = 0; v < mesh.vertices.length; v += 3) rotate(R, mesh.vertices, v, g.pos, local);
    const at = (i: number): Vec3 => [local[3 * i], local[3 * i + 1], local[3 * i + 2]];
    for (let f = 0; f < mesh.faces.length; f += 3) fill(at(mesh.faces[f]), at(mesh.faces[f + 1]), at(mesh.faces[f + 2]), edge, local);
    for (const v of local) out.push(v);
  }
  const n = out.length / 3, step = Math.max(n / MOST, 1), kept = Math.floor(n / step), thin = new Float64Array(3 * kept);
  for (let i = 0; i < kept; i++) {
    const k = 3 * Math.floor(i * step);
    thin[3 * i] = out[k];
    thin[3 * i + 1] = out[k + 1];
    thin[3 * i + 2] = out[k + 2];
  }
  return thin;
}

export function handSurface(s: RobotSession): HandSurface & { dispose(): void } {
  const h = s.handle, m = arrays(h.model);
  const data = new h.mj.MjData(h.model);
  const d = data as unknown as { qpos: Float64Array; xpos: Float64Array; xmat: Float64Array };
  // A joint on one limb only belongs to that finger; one on several (a wrist) belongs to the palm.
  const uses = new Map<number, string[]>();
  for (const l of s.limbs) for (const k of l.index) uses.set(k, [...(uses.get(k) ?? []), l.name]);
  const jointOf = new Map<number, number>();
  s.joints.forEach((j, k) => jointOf.set(h.id(OBJ.joint, j.name), k));
  const robotJoints = (b: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < m.body_jntnum[b]; i++) {
      const k = jointOf.get(m.body_jntadr[b] + i);
      if (k !== undefined) out.push(k);
    }
    return out;
  };
  const owned = Array.from({ length: m.nbody }, (_, b) => {
    const joints: number[] = [];
    let finger: string | null = null;
    for (let a = b; a > 0; a = m.body_parentid[a]) {
      for (const k of robotJoints(a)) {
        joints.push(k);
        if (!finger && uses.get(k)?.length === 1) finger = uses.get(k)![0];
      }
    }
    return { b, finger, joints };
  });
  const parents = new Set(owned.map(({ b }) => m.body_parentid[b]));
  const bodies: number[] = [];
  const links: HandLink[] = [];
  for (const { b, finger, joints } of owned.slice(1)) {
    const points = samples(s, b, !finger ? EDGE : parents.has(b) ? FINGER_EDGE : TIP_EDGE);
    if (!points.length) continue;
    bodies.push(b);
    links.push({ name: h.name(OBJ.body, b), finger, joints, points });
  }
  return {
    links,
    frames(q: number[]): Transform[] {
      d.qpos.set(s.rest);
      s.qposAdr.forEach((adr, k) => (d.qpos[adr] = q[k]));
      h.mj.mj_kinematics(h.model, data);
      const xpos = d.xpos, xmat = d.xmat;
      return bodies.map((b) => ({
        p: [xpos[3 * b], xpos[3 * b + 1], xpos[3 * b + 2]],
        R: Array.from({ length: 9 }, (_, i) => xmat[9 * b + i]) as Mat3,
      }));
    },
    dispose: () => data.delete(),
  };
}
