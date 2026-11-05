import { gzipSync } from 'node:zlib';
import fs from 'node:fs';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSpecAssembly } from '@/cad/assembly/spec/build';
import { partOf } from '@/cad/common/part';
import { type Bake, decodeBake, encodeBake, forgetBakes, installBake, preloadBake, recordBake, specKey } from '@/cad/parts/castings/bake';
import { parseRobot } from '@/core/robot/schema/parse';
import type { RobotSpec } from '@/core/robot/schema/types';

const preset = (id: string) => parseRobot(JSON.parse(fs.readFileSync(new URL(`../../presets/studio/${id}.json`, import.meta.url), 'utf8')));

/** Every casting mesh, by label: bodies, panels and interiors. */
function castings(spec: RobotSpec) {
  const a = buildSpecAssembly(spec);
  const meshes: THREE.Mesh[] = [];
  a.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && partOf(o)?.layer === 'housing' && m.geometry.index && (m.userData.field || m.userData.capAs)) meshes.push(m);
  });
  return { a, meshes };
}

function expectSame(spec: RobotSpec, live: ReturnType<typeof castings>, baked: ReturnType<typeof castings>, near: number) {
  expect(baked.a.floorZ).toBe(live.a.floorZ);
  expect(baked.a.hull).toEqual(live.a.hull);
  expect(baked.meshes.map((m) => partOf(m)!.label)).toEqual(live.meshes.map((m) => partOf(m)!.label));
  live.meshes.forEach((m, i) => {
    const [p, q] = [m.geometry.attributes.position.array, baked.meshes[i].geometry.attributes.position.array];
    expect(q.length).toBe(p.length);
    expect(baked.meshes[i].geometry.index!.array).toEqual(m.geometry.index!.array);
    let most = 0;
    for (let k = 0; k < p.length; k++) most = Math.max(most, Math.abs(p[k] - q[k]));
    expect(most, `${partOf(m)!.label} in ${spec.name}`).toBeLessThan(near);
  });
}

/** A host that answers with these bytes, or with `status` and nothing. */
const hosting = (bytes: Uint8Array | null, status = 200) => vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes as BodyInit | null, { status: bytes ? status : 404 })));

const bakeOf = (spec: RobotSpec): Bake => recordBake(spec, () => buildSpecAssembly(spec).dispose());

describe('baked castings', () => {
  afterEach(() => {
    forgetBakes();
    vi.unstubAllGlobals();
  });

  for (const id of ['iiwa14', 'scara', 'youbot']) {
    it(`${id}: loads through the baked path and matches live`, async () => {
      const spec = preset(id);
      const live = castings(spec);
      hosting(gzipSync(encodeBake(bakeOf(spec)), { level: 9 }));
      expect(await preloadBake(spec)).toBe(true);
      expect(fetch).toHaveBeenCalledOnce();
      // 16 bits across a body of at most a metre or so.
      expectSame(spec, live, castings(spec), 3e-5);
      live.a.dispose();
    });
  }

  it('a missing file falls back to live meshing', async () => {
    const spec = preset('scara');
    const live = castings(spec);
    hosting(null);
    expect(await preloadBake(spec)).toBe(false);
    expectSame(spec, live, castings(spec), 1e-12);
  });

  it('a host answering with something else falls back too', async () => {
    const spec = preset('scara');
    hosting(new TextEncoder().encode('<!doctype html>'));
    expect(await preloadBake(spec)).toBe(false);
    hosting(gzipSync(new TextEncoder().encode('<!doctype html>')));
    expect(await preloadBake(spec)).toBe(false);
  });

  it('a failed fetch falls back too', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await preloadBake(preset('scara'))).toBe(false);
  });

  it('never fetches for a robot being edited', async () => {
    hosting(null);
    const { design: _none, ...draft } = preset('scara');
    expect(await preloadBake(draft)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('the same inputs give the same key and the same bytes', () => {
    const spec = preset('scara');
    expect(specKey(preset('scara'))).toBe(specKey(spec));
    const [a, b] = [encodeBake(bakeOf(spec)), encodeBake(bakeOf(spec))];
    expect(Buffer.compare(a, b)).toBe(0);
    expect(Buffer.compare(gzipSync(a, { level: 9 }), gzipSync(b, { level: 9 }))).toBe(0);
  });

  it('a change to the design or the kinematics changes the key, so an old file cannot be picked up', () => {
    const spec = preset('scara');
    expect(specKey({ ...spec, design: { ...spec.design, section: { at: 0.5 } } })).not.toBe(specKey(spec));
    expect(specKey({ ...spec, base: [0, 0, 0.4] })).not.toBe(specKey(spec));
  });

  it('a bake survives its own encoding', () => {
    const spec = preset('scara');
    const bake = bakeOf(spec);
    const data = encodeBake(bake);
    const back = decodeBake(data.buffer as ArrayBuffer)!;
    expect([...back.keys()]).toEqual([...bake.keys()].sort((x, y) => x - y));
    installBake(spec, back);
    expect(back.get(0)!.balls).toEqual(bake.get(0)!.balls);
  });
});
