/** The checks every casting has to pass, shared by the iiwa's own test and the gate over all designed presets. */
import * as THREE from 'three';
import { buildSpecAssembly } from '@/cad/assembly/spec/build';
import { moduleOf } from '@/cad/assembly/types';
import { hullOf } from '@/cad/common/hull';
import { partOf } from '@/cad/common/part';
import { planChain } from '@/cad/parts/castings/plan';
import { shapeSolid } from '@/cad/parts/castings/recipe';
import { chainFrames, zeroPose } from '@/core/chain/kinematics/frames';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import type { Vec3 } from '@/core/math/linear/vec';
import { hullMjcf } from '@/core/mjcf/writer/hull';
import { specDofs } from '@/core/robot/config/pose';
import type { BodyDesign } from '@/core/robot/schema/design';
import type { RobotSpec } from '@/core/robot/schema/types';
import { ModelHandle } from '@/physics/model/handle';
import { OBJ, arrays } from '@/physics/runtime/arrays';

/** Every contact between two modules at a pose, with no tolerance: the checker masks any pair touching at home, however lightly. */
export async function contactProbe(spec: RobotSpec) {
  const asm = buildSpecAssembly(spec);
  const chain = chainFromSpec(spec);
  const hull = asm.hull!;
  const h = await ModelHandle.fromXml(hullMjcf(chain, hull));
  const m = arrays(h.model);
  const adr = chain.joints.map((_, k) => m.jnt_qposadr[k]);
  const rest = Float64Array.from(m.qpos0);
  const data = h.data as unknown as { qpos: Float64Array; ncon: number; contact: { size(): number; get(i: number): { geom1: number; geom2: number; dist: number; delete(): void } | undefined; delete(): void } };
  const at = (q: number[]) => {
    data.qpos.set(rest);
    adr.forEach((a, k) => (data.qpos[a] = q[k]));
    h.mj.mj_kinematics(h.model, h.data);
    h.mj.mj_collision(h.model, h.data);
    const out = new Map<string, number>();
    if (!data.ncon) return out;
    const all = data.contact;
    for (let i = 0; i < all.size(); i++) {
      const c = all.get(i);
      if (!c) continue;
      const [a, b] = [c.geom1, c.geom2].map((g) => hull[Number(h.name(OBJ.geom, g).slice(1))].module);
      if (a !== b) {
        const key = [a, b].sort().join(' / ');
        out.set(key, Math.min(out.get(key) ?? 0, c.dist));
      }
      c.delete();
    }
    all.delete();
    return out;
  };
  return { asm, chain, at, dispose: () => h.dispose() };
}

/** Each casting's drawn vertices at the zero pose, by module. */
export function drawn(asm: ReturnType<typeof buildSpecAssembly>, spec: RobotSpec) {
  const chain = chainFromSpec(spec);
  asm.update([chainFrames(chain, zeroPose(chain))], 0);
  asm.root.updateMatrixWorld(true);
  const out = new Map<string, THREE.Vector3[]>();
  const p = new THREE.Vector3();
  asm.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const id = moduleOf(o) ?? '';
    if (!mesh.isMesh || partOf(o)?.layer !== 'housing' || !(id === 'base' || id.startsWith('link:')) || !mesh.geometry.index) return;
    const pos = mesh.geometry.attributes.position;
    const list = out.get(id) ?? [];
    for (let i = 0; i < pos.count; i++) list.push(p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).clone());
    out.set(id, list);
  });
  return out;
}

export function spheresOf(asm: ReturnType<typeof buildSpecAssembly>) {
  const out = new Map<string, { at: THREE.Vector3; r: number }[]>();
  asm.root.traverse((o) => {
    const h = hullOf(o);
    const id = moduleOf(o) ?? '';
    if (h?.shape !== 'sphere') return;
    out.set(id, [...(out.get(id) ?? []), { at: o.getWorldPosition(new THREE.Vector3()), r: h.size[0] }]);
  });
  return out;
}

/** Named features of a body that overlap, sampled through each one; only the `host` form is there to be cut. */
export function featureClashes(spec: RobotSpec): string[] {
  const out = new Set<string>();
  const plan = planChain(spec);
  const bodies: [BodyDesign | undefined, Vec3][] = [[spec.design?.base, spec.base], ...spec.links.map((l, k): [BodyDesign | undefined, Vec3] => [spec.design?.links?.[l.name], plan.joints[k].origin])];
  for (const [design, origin] of bodies) {
    const named = (design?.shapes ?? []).filter((s) => s.feature && !s.host).map((op) => ({ op, ...shapeSolid(op, origin) }));
    for (const a of named) for (const b of named) {
      if (a.op.feature === b.op.feature || !a.op.cut) continue;
      const step = a.bound.r / 24;
      for (let x = -a.bound.r; x <= a.bound.r; x += step) for (let y = -a.bound.r; y <= a.bound.r; y += step) for (let z = -a.bound.r; z <= a.bound.r; z += step) {
        const [px, py, pz] = [a.bound.at[0] + x, a.bound.at[1] + y, a.bound.at[2] + z];
        if (pz > origin[2] && a.solid.f(px, py, pz) < -0.0005 && b.solid.f(px, py, pz) < -0.0005) out.add(`${a.op.feature} / ${b.op.feature}`);
      }
    }
  }
  return [...out];
}

/** Drawn parts by the chain body that carries them: a drive's fixed half rides its parent, the rest its link. */
export function rigidBodies(asm: ReturnType<typeof buildSpecAssembly>, spec: RobotSpec) {
  const out = new Map<number, THREE.Mesh[]>();
  const add = (k: number, g: THREE.Object3D) => g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh && partOf(o)) out.set(k, [...(out.get(k) ?? []), m]);
  });
  const stages = asm.root.children.filter((c) => typeof c.userData.module === 'string');
  for (const s of stages) {
    const id = s.userData.module as string;
    if (id === 'base') add(-1, s);
    else {
      const k = spec.links.findIndex((l) => `joint:${l.name}` === id);
      add(stages.find((x) => x.userData.module === id) === s ? k - 1 : k, s);
    }
  }
  return out;
}


/** Parts of one rigid body can overlap with no contact to report: different-module checks never see a trunk through its own collar. */
export function sameBodyOverlaps(asm: ReturnType<typeof buildSpecAssembly>, spec: RobotSpec): string[] {
  const chain = chainFromSpec(spec);
  asm.update([chainFrames(chain, zeroPose(chain))], 0);
  asm.root.updateMatrixWorld(true);
  const found: string[] = [];
  const p = new THREE.Vector3();
  for (const parts of rigidBodies(asm, spec).values()) for (const B of parts) {
    const f = B.userData.field as ((x: number, y: number, z: number) => number) | undefined;
    if (!f) continue;
    for (const A of parts) {
      if (A === B || A.userData.capAs === B) continue;
      const pos = A.geometry.attributes.position;
      let deepest = 0;
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i).applyMatrix4(A.matrixWorld);
        deepest = Math.min(deepest, f(p.x, p.y, p.z));
      }
      if (deepest < -0.0002) found.push(`${partOf(A)!.label} in ${partOf(B)!.label}: ${(deepest * 1000).toFixed(2)} mm`);
    }
  }
  return found;
}

/** Every slide at either end of its travel in every combination, the other joints at `home`. */
export function strokeEnds(spec: RobotSpec, home: number[]): number[][] {
  const dofs = specDofs(spec);
  const slides = dofs.flatMap((d, k) => (d.type === 'slide' ? [k] : []));
  return Array.from({ length: 1 << slides.length }, (_, m) => {
    const q = [...home];
    slides.forEach((k, i) => (q[k] = dofs[k].limits[(m >> i) & 1]));
    return q;
  });
}

/** A bar has to stay in its guide and miss its walls at both ends of travel, drawn surfaces included. The hull alone would not show a bar through the wall it was bored for. */
export function strokeFaults(asm: ReturnType<typeof buildSpecAssembly>, spec: RobotSpec): string[] {
  const chain = chainFromSpec(spec);
  asm.update([chainFrames(chain, zeroPose(chain))], 0);
  asm.root.updateMatrixWorld(true);
  const bodies = rigidBodies(asm, spec);
  const found: string[] = [];
  const p = new THREE.Vector3();
  for (const j of planChain(spec).joints) {
    const s = j.slide;
    if (!s) continue;
    const rail = s.form === 'rail';
    const walls = (bodies.get(rail ? j.index : j.index - 1) ?? []).filter((m) => m.userData.field);
    const bars = (bodies.get(rail ? j.index - 1 : j.index) ?? []).filter((m) => ['Rail', 'Quill', 'Rack'].includes(partOf(m)!.label));
    const stage = asm.root.children.filter((c) => c.userData.module === `joint:${j.link.name}`)[rail ? 0 : 1];
    const mine = bars.filter((m) => { let n: THREE.Object3D | null = m; while (n && n !== stage) n = n.parent; return n === stage; });
    if (!mine.length || !walls.length) { found.push(`${j.link.name}: no bar or guide`); continue; }
    for (const q of s.stroke) {
      const engaged = rail ? s.bar[0] <= s.guide[0] + q && s.bar[1] >= s.guide[1] + q : s.bar[0] + q < s.guide[1] && s.bar[1] + q > s.guide[1];
      if (!engaged) found.push(`${j.link.name} leaves its guide at ${q}`);
      const by = j.axis.map((a) => a * (rail ? -q : q));
      for (const bar of mine) for (const wall of walls) {
        const pos = bar.geometry.attributes.position;
        const f = wall.userData.field as (x: number, y: number, z: number) => number;
        let deepest = 0;
        for (let i = 0; i < pos.count; i++) {
          p.fromBufferAttribute(pos, i).applyMatrix4(bar.matrixWorld);
          deepest = Math.min(deepest, f(p.x + by[0], p.y + by[1], p.z + by[2]));
        }
        if (deepest < 0) found.push(`${j.link.name} at ${q}: ${partOf(bar)!.label} in ${partOf(wall)!.label} by ${(deepest * 1000).toFixed(2)} mm`);
      }
    }
  }
  return found;
}

/** Faces are meshed apart and meet at edges, so a gap there would show daylight: an open edge needs another piece's beside it. */
export function crackedCastings(asm: ReturnType<typeof buildSpecAssembly>): string[] {
  const found: string[] = [];
  asm.root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh || !o.userData.field) return;
    const pieces = [o as THREE.Mesh, ...o.parent!.children.filter((c) => c.userData.capAs === o)] as THREE.Mesh[];
    const open = pieces.flatMap((mesh) => {
      const index = mesh.geometry.index!.array;
      const pos = mesh.geometry.attributes.position;
      const edges = new Map<number, number>();
      const n = pos.count;
      for (let i = 0; i < index.length; i += 3) for (let c = 0; c < 3; c++) {
        const [a, b] = [index[i + c], index[i + ((c + 1) % 3)]];
        const key = Math.min(a, b) * n + Math.max(a, b);
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
      return [...edges].filter(([, v]) => v === 1).map(([k]) => {
        const [a, b] = [Math.floor(k / n), k % n];
        return new THREE.Vector3().fromBufferAttribute(pos, a).add(new THREE.Vector3().fromBufferAttribute(pos, b)).multiplyScalar(0.5);
      });
    });
    const cell = 0.002;
    const bins = new Map<string, THREE.Vector3[]>();
    const key = (v: THREE.Vector3, dx = 0, dy = 0, dz = 0) => `${Math.floor(v.x / cell) + dx},${Math.floor(v.y / cell) + dy},${Math.floor(v.z / cell) + dz}`;
    for (const v of open) bins.set(key(v), [...(bins.get(key(v)) ?? []), v]);
    const alone = open.filter((v) => {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (const w of bins.get(key(v, dx, dy, dz)) ?? []) if (w !== v && w.distanceTo(v) < 0.0035) return false;
      }
      return true;
    });
    if (alone.length / Math.max(1, open.length) >= 0.003) found.push(`${partOf(o)!.label}: ${alone.length} of ${open.length} open edges alone`);
  });
  return found;
}
