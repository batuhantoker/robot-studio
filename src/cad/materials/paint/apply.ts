/** Recolours an imported robot at load from its real scheme; the model files stay as they are. */
import * as THREE from 'three';
import type { Vec3 } from '../../../core/math/linear/vec';
import { type Assembly, type ModuleInfo, moduleOf } from '../../assembly/types';
import { partOf, tag } from '../../common/part';
import { type Coat, PAINT, type PaintRule, type Region } from './table';

const rgba = (hex: string) => [...new THREE.Color(hex).convertLinearToSRGB().toArray(), 1];
const coatOf = (assembly: Assembly, { finish, color }: Coat) => assembly.mats.finish(finish, rgba(color));

function claims(rule: PaintRule, mesh: THREE.Mesh, module: ModuleInfo, tips: Map<number, number>): boolean {
  if (rule.name && !rule.name.test(module.label) && !rule.name.test(mesh.name)) return false;
  const limb = module.limb ?? 0;
  if (rule.at === 'base') return limb < 0;
  return rule.at !== 'tip' || module.joints.includes(tips.get(limb) ?? -1);
}

/** CAD surfaces end at creases, so triangles joined across a soft edge are one surface. */
const SOFT = Math.cos(Math.PI / 6);

interface Surfaces {
  of: Int32Array;
  boxes: Map<number, THREE.Box3>;
}

function smoothSurfaces(pos: THREE.BufferAttribute, matrix: THREE.Matrix4): Surfaces {
  const count = pos.count / 3;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const normals = new Float32Array(count * 3);
  const ids = new Map<string, number>();
  const vertex = (i: number) => {
    const key = `${pos.getX(i).toFixed(5)},${pos.getY(i).toFixed(5)},${pos.getZ(i).toFixed(5)}`;
    let id = ids.get(key);
    if (id === undefined) ids.set(key, (id = ids.size));
    return id;
  };
  const parent = Int32Array.from({ length: count }, (_, i) => i);
  const find = (x: number) => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]];
    return x;
  };
  const edges = new Map<string, number>();
  for (let t = 0; t < count; t++) {
    a.fromBufferAttribute(pos, 3 * t);
    b.fromBufferAttribute(pos, 3 * t + 1).sub(a);
    c.fromBufferAttribute(pos, 3 * t + 2).sub(a);
    b.cross(c).normalize().toArray(normals, 3 * t);
    const v = [vertex(3 * t), vertex(3 * t + 1), vertex(3 * t + 2)];
    for (let k = 0; k < 3; k++) {
      const p = v[k], q = v[(k + 1) % 3], key = p < q ? `${p},${q}` : `${q},${p}`;
      const other = edges.get(key);
      if (other === undefined) {
        edges.set(key, t);
        continue;
      }
      const dot = normals[3 * t] * normals[3 * other] + normals[3 * t + 1] * normals[3 * other + 1] + normals[3 * t + 2] * normals[3 * other + 2];
      if (dot >= SOFT) parent[find(t)] = find(other);
    }
  }
  const of = Int32Array.from({ length: count }, (_, t) => find(t));
  const boxes = new Map<number, THREE.Box3>();
  for (let t = 0; t < count; t++) {
    const box = boxes.get(of[t]) ?? boxes.set(of[t], new THREE.Box3()).get(of[t])!;
    for (let k = 0; k < 3; k++) box.expandByPoint(a.fromBufferAttribute(pos, 3 * t + k).applyMatrix4(matrix));
  }
  return { of, boxes };
}

const boxOf = ([min, max]: [Vec3, Vec3]) => new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));

/** Which triangles a region takes, by index; `centres` are in the body frame. */
function picker(region: Region, centres: THREE.Vector3[], surfaces: () => Surfaces): (t: number) => boolean {
  if ('box' in region) {
    const box = boxOf(region.box);
    return (t) => box.containsPoint(centres[t]);
  }
  const { of, boxes } = surfaces();
  const taken = new Set<number>();
  if ('surfaces' in region) {
    const box = boxOf(region.surfaces);
    for (const [id, b] of boxes) if (box.containsBox(b)) taken.add(id);
  } else {
    for (const seed of region.through) {
      const at = new THREE.Vector3(...seed);
      let best = 0;
      centres.forEach((c, t) => {
        if (c.distanceToSquared(at) < centres[best].distanceToSquared(at)) best = t;
      });
      taken.add(of[best]);
    }
  }
  return (t) => taken.has(of[t]);
}

/** A second mesh per coat, not a material group: the Cutaway swaps one material per mesh. */
function carve(mesh: THREE.Mesh, zones: PaintRule[], assembly: Assembly, made: THREE.BufferGeometry[]): void {
  const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const pos = source.attributes.position as THREE.BufferAttribute, normal = source.attributes.normal;
  mesh.updateMatrix();
  const count = pos.count / 3;
  const b = new THREE.Vector3(), c = new THREE.Vector3();
  const centres = Array.from({ length: count }, (_, t) => new THREE.Vector3().fromBufferAttribute(pos, 3 * t)
    .add(b.fromBufferAttribute(pos, 3 * t + 1)).add(c.fromBufferAttribute(pos, 3 * t + 2)).divideScalar(3).applyMatrix4(mesh.matrix));
  let cached: Surfaces | undefined;
  const surfaces = () => (cached ??= smoothSurfaces(pos, mesh.matrix));
  const picks = zones.map((z) => picker(z.within!, centres, surfaces));
  const buckets: number[][] = Array.from({ length: zones.length + 1 }, () => []);
  for (let t = 0; t < count; t++) {
    const k = picks.findIndex((pick) => pick(t));
    buckets[k < 0 ? zones.length : k].push(3 * t);
  }
  const geometryOf = (starts: number[]) => {
    const g = new THREE.BufferGeometry();
    for (const [name, attr] of [['position', pos], ['normal', normal]] as const) {
      const out = new Float32Array(starts.length * 9);
      starts.forEach((s, t) => out.set((attr.array as Float32Array).subarray(s * 3, s * 3 + 9), t * 9));
      g.setAttribute(name, new THREE.BufferAttribute(out, 3));
    }
    made.push(g);
    return g;
  };
  const meta = partOf(mesh)!;
  zones.forEach((zone, k) => {
    if (!buckets[k].length) return;
    const piece = new THREE.Mesh(geometryOf(buckets[k]), coatOf(assembly, zone.coat));
    piece.name = mesh.name;
    piece.position.copy(mesh.position);
    piece.quaternion.copy(mesh.quaternion);
    piece.castShadow = piece.receiveShadow = true;
    tag(piece, { label: meta.label, layer: 'housing', explode: meta.explode, material: zone.coat.finish });
    mesh.parent!.add(piece);
  });
  mesh.geometry = geometryOf(buckets[zones.length]);
}

export const creaseOf = (id: string): number | undefined => PAINT[id]?.crease;

export function paintAssembly(assembly: Assembly, robot: { id: string; maker: string }): void {
  // Only a body's own meshes: fitted tools sit in nested groups and keep their materials.
  const parts = assembly.root.children.flatMap((body) => body.children)
    .filter((o): o is THREE.Mesh => (o as THREE.Mesh).isMesh && partOf(o)?.layer === 'housing');
  // A maker's row is for colourless models: one that already has colour keeps it.
  const scheme = PAINT[robot.id] ?? (parts.some((m) => partOf(m)?.material === 'paint') ? undefined : PAINT[robot.maker]);
  if (!scheme) return;
  const modules = new Map(assembly.modules.map((m) => [m.id, m]));
  const tips = new Map<number, number>();
  for (const m of assembly.modules) for (const j of m.joints) tips.set(m.limb ?? 0, Math.max(tips.get(m.limb ?? 0) ?? -1, j));
  const made: THREE.BufferGeometry[] = [];
  for (const mesh of parts) {
    const meta = partOf(mesh);
    const module = modules.get(moduleOf(mesh) ?? '');
    if (!meta || !module) continue;
    const mine = scheme.parts?.filter((r) => claims(r, mesh, module, tips)) ?? [];
    const rule = mine.find((r) => !r.within);
    const zones = mine.filter((r) => r.within);
    if (!rule && !zones.length && meta.material === 'glass') continue;
    const coat = rule?.coat ?? scheme.body;
    mesh.material = coatOf(assembly, coat);
    meta.material = coat.finish;
    if (zones.length) carve(mesh, zones, assembly, made);
  }
  if (!made.length) return;
  const dispose = assembly.dispose;
  assembly.dispose = () => {
    made.forEach((g) => g.dispose());
    dispose.call(assembly);
  };
}
