/**
 * Measures where a tool bolts onto every bare catalog arm: the last joint's axis, the flange face at the end of its mesh
 * (or on the manifest's tool body), which way is out of the wrist, and a tool size from the flange and the arm's reach.
 * overrides.json holds what had to be corrected by eye (face, push, flip, r, size, limbs, wrist, hide: a regex of bodies, geoms or meshes the tool replaces);
 * homes.json the joints a tool needs moved at home.
 */
import fs from 'node:fs';
import { it } from 'vitest';
import { bodyFor } from '@/app/robots/body';
import { loadCatalog } from '@/app/robots/catalog';
import { sessionFromCatalog } from '@/app/robots/from-catalog';
import { fixedTool, ownTool } from '@/cad/assembly/mjcf/own-tools';
import { chainFrames } from '@/core/chain/kinematics/frames';
import { limbQ } from '@/core/chain/limbs/types';
import { matToQuat } from '@/core/math/linear/transform';
import type { Mat3 } from '@/core/math/linear/mat3';
import { readBodies } from '@/physics/extract/bodies';
import { type GeomInfo, readGeoms, readMesh, visibleGeom } from '@/physics/extract/geoms';
import { OBJ, arrays, state } from '@/physics/runtime/arrays';

const ROBOTS = 'public/robots/';
const OUT = 'src/cad/assembly/mjcf/mounts.json';
const read = (f: string) => JSON.parse(fs.readFileSync(`scripts/mounts/${f}`, 'utf8'));

type V = number[];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: V, b: V) => a.map((v, i) => v - b[i]);
const round = (v: number) => +v.toFixed(6);

/** A geom's mesh vertices in the world, as the model stands. */
function vertices(g: GeomInfo, mesh: Float32Array, xmat: ArrayLike<number>, xpos: ArrayLike<number>): V[] {
  const [w, x, y, z] = g.quat, b = g.body, out: V[] = [];
  const R = [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y), 2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x), 2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)];
  for (let i = 0; i < mesh.length; i += 3) {
    const l = [0, 1, 2].map((k) => R[3 * k] * mesh[i] + R[3 * k + 1] * mesh[i + 1] + R[3 * k + 2] * mesh[i + 2] + g.pos[k]);
    out.push([0, 1, 2].map((k) => xmat[9 * b + 3 * k] * l[0] + xmat[9 * b + 3 * k + 1] * l[1] + xmat[9 * b + 3 * k + 2] * l[2] + xpos[3 * b + k]));
  }
  return out;
}

it('writes the mount of every bare arm', async () => {
  globalThis.fetch = (async (u: string) => {
    const p = ROBOTS + String(u).replace(/^.*?robots\//, '').split('?')[0];
    return new Response(fs.readFileSync(p), { headers: { 'content-type': p.endsWith('.json') ? 'application/json' : 'application/octet-stream' } });
  }) as typeof fetch;
  const catalog = await loadCatalog();
  const overrides = read('overrides.json'), homes = read('homes.json');
  const arms = catalog!.robots.filter((r) => !r.prosthesis && ((r.category ?? 'arm') === 'arm' || overrides[r.id]?.wrist) && !ownTool(r.id) && !fixedTool(r.id));
  const table: Record<string, unknown> = {};
  for (const r of arms) {
    const s = await sessionFromCatalog(r, undefined, null);
    const h = s.handle, m = arrays(h.model), d = state(h.data), xmat = (h.data as unknown as { xmat: Float64Array }).xmat;
    const body = bodyFor(s), bodies = readBodies(h), geoms = readGeoms(h);
    const ov = overrides[r.id] ?? {};
    const limbs: number[] = ov.limbs ?? body.parts.filter((p) => p.kind === 'arm').map((p) => p.limb);
    const mounts: unknown[] = [];
    let size = Infinity;
    for (const li of limbs) {
      const l = s.limbs[li], f = chainFrames(l.chain, limbQ(l, s.home));
      const j = l.chain.joints.length - 1, joint = l.chain.joints[j];
      const o = f.origins[j];
      let a: V = f.axes[j];
      const last = m.jnt_bodyid[h.id(3, joint.name)];
      const carried = new Set([last]);
      bodies.forEach((b) => carried.has(b.parent) && carried.add(b.id));
      const hide = ov.hide ? new RegExp(ov.hide) : null;
      const hidden = (g: GeomInfo) => !!hide && [bodies[g.body].name, g.name, g.mesh >= 0 ? h.name(OBJ.mesh, g.mesh) : ''].some((n) => hide.test(n));
      const points = (set: Set<number>, all = false) => geoms.filter((g) => set.has(g.body) && visibleGeom(g) && g.mesh >= 0 && (all || !hidden(g))).flatMap((g) => vertices(g, readMesh(h, g.mesh).vertices, xmat, d.xpos));
      const own = points(carried), prev = points(new Set([bodies[last].parent]));
      // A wrist's last joint crosses the hand, so the tool runs along the hand instead of that joint's axis.
      if (ov.wrist) {
        const hand = points(carried, true);
        const towards = [0, 1, 2].map((k) => hand.reduce((t, p) => t + p[k], 0) / hand.length - o[k]);
        a = towards.map((v) => v / Math.hypot(...towards));
      }
      const mean = (ps: V[]) => ps.reduce((t, p) => t + dot(sub(p, o), a), 0) / Math.max(ps.length, 1);
      // A SCARA's quill runs through its arm, so its mesh can't say which end is out: tools hang down.
      const scara = l.chain.joints.some((x) => x.type === 'slide') && Math.abs(a[2]) > 0.9;
      let out = ov.wrist ? 1 : scara ? (a[2] > 0 ? -1 : 1) : prev.length ? Math.sign(mean(own) - mean(prev)) || 1 : 1;
      if (ov.flip) out = -out;
      a = a.map((v) => v * out);
      const along = own.map((p) => dot(sub(p, o), a));
      const radial = (p: V) => { const t = dot(sub(p, o), a); return Math.hypot(...sub(sub(p, o), a.map((v) => v * t))); };
      const meshFace = along.length ? Math.max(...along) : 0;
      const tipName = 'body' in (r.chains?.[li] ?? r.chain!).tip ? ((r.chains?.[li] ?? r.chain!).tip as { body: string }).body : null;
      const tb = tipName ? h.id(1, tipName) : -1;
      const tp = tb >= 0 ? [d.xpos[3 * tb], d.xpos[3 * tb + 1], d.xpos[3 * tb + 2]] : null;
      const onAxis = tp && tb !== last && radial(tp) < 1e-3 && dot(sub(tp, o), a) > meshFace - 0.012 && dot(sub(tp, o), a) < meshFace + 0.08;
      const face: number = (ov.face ?? (onAxis ? dot(sub(tp, o), a) : meshFace)) + (ov.push ?? 0);
      const band = own.filter((p) => dot(sub(p, o), a) > Math.min(face, meshFace) - Math.max(0.006, 0.1 * (meshFace - Math.min(...along))));
      const flange: number = ov.r ?? Math.max(...band.map(radial), 0.01);
      const reach = body.parts.find((p) => p.limbs.includes(li))?.reach ?? 1;
      size = Math.min(size, ov.size ?? Math.min(Math.max(flange / 0.78, 0.03 * reach), 0.045 * reach));
      const R = Array.from({ length: 9 }, (_, i) => xmat[9 * last + i]);
      const toBody = (v: V) => [0, 1, 2].map((c) => R[c] * v[0] + R[3 + c] * v[1] + R[6 + c] * v[2]);
      const pos = toBody(sub(o.map((v, k) => v + a[k] * face), [d.xpos[3 * last], d.xpos[3 * last + 1], d.xpos[3 * last + 2]]));
      const z = toBody(a);
      const ref = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].sort((u, v) => Math.abs(dot(u, z)) - Math.abs(dot(v, z)))[0];
      const x0 = sub(ref, z.map((v) => v * dot(ref, z))), x = x0.map((v) => v / Math.hypot(...x0));
      const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
      const quat = matToQuat([x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]] as Mat3);
      mounts.push({ limb: li, body: bodies[last].name, pos: pos.map(round), quat: Array.from(quat).map(round) });
    }
    table[r.id] = { size: round(size), mounts, ...(homes[r.id] ? { home: homes[r.id] } : {}), ...(ov.hide ? { hide: ov.hide } : {}) };
    s.dispose();
  }
  fs.writeFileSync(OUT, `{\n${Object.entries(table).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n}\n`);
});
