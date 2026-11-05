import fs from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildSpecAssembly } from '@/cad/assembly/spec/build';
import { outlinePoints } from '@/cad/parts/made';
import { chainFrames, zeroPose } from '@/core/chain/kinematics/frames';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import { parseRobot } from '@/core/robot/schema/parse';

const spec = parseRobot(JSON.parse(fs.readFileSync('presets/studio/double_pendulum.json', 'utf8')));

describe('parts drawn as they are made', () => {
  it('runs an arc round its radius, either way round', () => {
    const left = outlinePoints([[1, 0], [-1, 0, 1]]), right = outlinePoints([[1, 0], [-1, 0, -1]]);
    for (const p of left.slice(0, -1)) expect(Math.hypot(p.x, p.y)).toBeCloseTo(1, 9);
    expect(Math.max(...left.map((p) => p.y))).toBeCloseTo(1, 2);
    expect(Math.min(...right.map((p) => p.y))).toBeCloseTo(-1, 2);
  });

  it('leaves straight edges alone', () => {
    expect(outlinePoints([[0, 0], [1, 0], [1, 1]]).map((p) => [p.x, p.y])).toEqual([[0, 0], [1, 0], [1, 1]]);
  });
});

describe('the double pendulum as it is made', () => {
  const asm = buildSpecAssembly(spec);
  const chain = chainFromSpec(spec);
  asm.update([chainFrames(chain, zeroPose(chain))], 0);
  const size = (label: string) => {
    let box: THREE.Box3 | null = null;
    asm.root.updateMatrixWorld(true);
    asm.root.traverse((o) => {
      if (!box && (o as THREE.Mesh).isMesh && (o.userData.part as { label?: string } | undefined)?.label === label) box = new THREE.Box3().setFromObject(o);
    });
    return (box as unknown as THREE.Box3).getSize(new THREE.Vector3());
  };

  it('has AK80-6 motors the size of the drawing: 98 across, 38.5 long', () => {
    const s = size('Shoulder motor (AK80-6)');
    expect(s.x).toBeCloseTo(0.098, 3);
    expect(s.y).toBeCloseTo(0.0372, 3);
  });

  it('has the upper link of lever_004: a 120 boss, 20 plate, 200 between centres', () => {
    const s = size('Upper link');
    expect(s.x).toBeCloseTo(0.12, 3);
    expect(s.z).toBeCloseTo(0.28, 3);
  });

  it('gives every body a hull and every part a home', () => {
    const hulled = new Set(asm.hull!.map((v) => v.module));
    for (const id of ['base', 'link:shoulder', 'link:elbow']) expect(hulled.has(id), id).toBe(true);
    expect(asm.modules.some((m) => m.id === 'tool')).toBe(false);
  });
});
