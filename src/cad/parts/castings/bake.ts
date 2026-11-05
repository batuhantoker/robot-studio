/**
 * Castings meshed ahead of time. Meshing is what makes a preset slow to open, so the build stores its results, keyed by the
 * generator and the spec: a file for anything else simply is not there, and the casting meshes live as it always did.
 */
import type { RobotSpec } from '../../../core/robot/schema/types';
import type { Surface } from './net';
import type { Ball } from './spheres';

/** Hash of the generator's sources, set by the bundler; absent where nothing was built. */
declare const __CASTINGS__: string | undefined;

export interface BakedCasting {
  body: Surface;
  panels: Surface[];
  inside: Surface;
  backs: Surface[];
  balls: Ball[];
}

/** By body: the chain link's index, or -1 for the base. */
export type Bake = Map<number, BakedCasting>;

export interface BakeSlot {
  use?: BakedCasting;
  keep?: (b: BakedCasting) => void;
}

const MAGIC = 0x314b4142;

/** cyrb53: enough to tell specs apart, and the same in the browser as in the build. */
export function specKey(spec: RobotSpec): string {
  const text = JSON.stringify(spec);
  let a = 0xdeadbeef, b = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 2654435761);
    b = Math.imul(b ^ c, 1597334677);
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return (4294967296 * (2097151 & b) + (a >>> 0)).toString(36);
}

const copy = (s: Surface): Surface => ({ position: s.position.slice(), normal: s.normal.slice(), index: s.index });
export const copyBaked = (b: BakedCasting): BakedCasting => ({ ...b, body: copy(b.body), panels: b.panels.map(copy), inside: copy(b.inside), backs: b.backs.map(copy) });

const loaded = new Map<string, Bake>();
let recording: { key: string; bake: Bake } | null = null;

export function bakeSlot(spec: RobotSpec, k: number): BakeSlot {
  const key = specKey(spec);
  const found = loaded.get(key)?.get(k);
  // Building moves these arrays into the body's frame, so each build gets its own.
  return { use: found && copyBaked(found), keep: recording?.key === key ? (b) => recording!.bake.set(k, copyBaked(b)) : undefined };
}

/** What `build` meshes for `spec`. */
export function recordBake(spec: RobotSpec, build: () => void): Bake {
  const bake: Bake = new Map();
  recording = { key: specKey(spec), bake };
  try {
    build();
  } finally {
    recording = null;
  }
  return bake;
}

export const installBake = (spec: RobotSpec, bake: Bake) => void loaded.set(specKey(spec), bake);
export const forgetBakes = () => loaded.clear();

interface SurfaceMeta {
  vertices: number;
  triangles: number;
  min: number[];
  range: number[];
}

function packSurface(s: Surface, chunks: ArrayBufferView[]): SurfaceMeta {
  const vertices = s.position.length / 3;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < s.position.length; i++) {
    min[i % 3] = Math.min(min[i % 3], s.position[i]);
    max[i % 3] = Math.max(max[i % 3], s.position[i]);
  }
  const range = max.map((v, i) => (vertices ? Math.max(v - min[i], 1e-9) : 1));
  const at = new Uint16Array(s.position.length);
  for (let i = 0; i < s.position.length; i++) at[i] = Math.round(((s.position[i] - min[i % 3]) / range[i % 3]) * 65535);
  const facing = new Int16Array(vertices * 2);
  for (let i = 0; i < vertices; i++) {
    const [x, y, z] = [s.normal[i * 3], s.normal[i * 3 + 1], s.normal[i * 3 + 2]];
    const l = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1;
    let [u, v] = [x / l, y / l];
    // Octahedral: the lower half folds over onto the upper.
    if (z < 0) [u, v] = [(1 - Math.abs(v)) * Math.sign(u || 1), (1 - Math.abs(u)) * Math.sign(v || 1)];
    facing[i * 2] = Math.round(u * 32767);
    facing[i * 2 + 1] = Math.round(v * 32767);
  }
  chunks.push(at, facing, s.index);
  return { vertices, triangles: s.index.length / 3, min: vertices ? min : [0, 0, 0], range };
}

function unpackSurface(m: SurfaceMeta, take: (bytes: number) => ArrayBuffer): Surface {
  const at = new Uint16Array(take(m.vertices * 6));
  const facing = new Int16Array(take(m.vertices * 4));
  const index = new Uint32Array(take(m.triangles * 12));
  const position = new Float32Array(m.vertices * 3), normal = new Float32Array(m.vertices * 3);
  for (let i = 0; i < position.length; i++) position[i] = m.min[i % 3] + (at[i] / 65535) * m.range[i % 3];
  for (let i = 0; i < m.vertices; i++) {
    let [u, v] = [facing[i * 2] / 32767, facing[i * 2 + 1] / 32767];
    const z = 1 - Math.abs(u) - Math.abs(v);
    if (z < 0) [u, v] = [(1 - Math.abs(v)) * Math.sign(u || 1), (1 - Math.abs(u)) * Math.sign(v || 1)];
    const l = Math.hypot(u, v, z) || 1;
    normal[i * 3] = u / l;
    normal[i * 3 + 1] = v / l;
    normal[i * 3 + 2] = z / l;
  }
  return { position, normal, index };
}

export function encodeBake(bake: Bake): Uint8Array {
  const chunks: ArrayBufferView[] = [];
  const pack = (s: Surface) => packSurface(s, chunks);
  const meta = [...bake].sort(([a], [b]) => a - b).map(([k, b]) => ({ k, body: pack(b.body), panels: b.panels.map(pack), inside: pack(b.inside), backs: b.backs.map(pack), balls: b.balls }));
  const text = new TextEncoder().encode(JSON.stringify(meta));
  const size = 8 + text.length + chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(size);
  const head = new DataView(out.buffer);
  head.setUint32(0, MAGIC, true);
  head.setUint32(4, text.length, true);
  out.set(text, 8);
  let at = 8 + text.length;
  for (const c of chunks) {
    out.set(new Uint8Array(c.buffer, c.byteOffset, c.byteLength), at);
    at += c.byteLength;
  }
  return out;
}

/** Null for anything that is not a bake: a host may answer a missing file with a page of its own. */
export function decodeBake(data: ArrayBuffer): Bake | null {
  if (data.byteLength < 8) return null;
  const head = new DataView(data);
  if (head.getUint32(0, true) !== MAGIC) return null;
  const length = head.getUint32(4, true);
  type Packed = { k: number; body: SurfaceMeta; panels: SurfaceMeta[]; inside: SurfaceMeta; backs: SurfaceMeta[]; balls: Ball[] };
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 8, length))) as Packed[];
  let at = 8 + length;
  // Copied out: chunks sit at any offset, and typed arrays want theirs aligned.
  const take = (bytes: number) => data.slice(at, (at += bytes));
  const unpack = (m: SurfaceMeta) => unpackSurface(m, take);
  return new Map(meta.map((c) => [c.k, { body: unpack(c.body), panels: c.panels.map(unpack), inside: unpack(c.inside), backs: c.backs.map(unpack), balls: c.balls }]));
}

/** Fetches a preset's bake if the build made one. Anything going wrong here only means meshing live. */
export async function preloadBake(spec: RobotSpec): Promise<boolean> {
  if (!spec.design || typeof __CASTINGS__ === 'undefined') return false;
  const key = specKey(spec);
  if (loaded.has(key)) return true;
  try {
    const answer = await fetch(`${import.meta.env?.BASE_URL ?? '/'}bake/${__CASTINGS__}/${key}.bin`);
    if (!answer.ok || !answer.body) return false;
    const bake = decodeBake(await new Response(answer.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    if (bake) loaded.set(key, bake);
    return !!bake;
  } catch {
    return false;
  }
}
